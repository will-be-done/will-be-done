import { Effect } from "effect";
import {
  asyncDispatch,
  createAction,
  createSelector,
  DB,
  execAsync,
  defineTable,
  selectAsync,
  selectFrom,
  type TableDefinition,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncConfig } from "./syncTypes";
import { createStoreDbs, withStoreStartupLock } from "./storeDbs";
import {
  registeredSpaceSyncableTables,
  searchIndexTables,
  searchSpace,
  spaceMigrationsTable,
  tasksTable,
} from "@will-be-done/slices/space";

const { openPersistentDriver } = vi.hoisted(() => ({
  openPersistentDriver: vi.fn(),
}));

vi.mock("./persistentDriver", () => ({ openPersistentDriver }));

class PersistentInMemoryDriver extends BptreeInmemDriver {
  private readonly loadedTableNames = new Set<string>();

  *loadTables(tables: TableDefinition[]) {
    const unloadedTables = tables.filter(
      (table) => !this.loadedTableNames.has(table.tableName),
    );
    yield* super.loadTables(unloadedTables);
    for (const table of unloadedTables) {
      this.loadedTableNames.add(table.tableName);
    }
  }
}

const startupItemsTable = defineTable("startup_test_items", {
  id: v.string(),
  title: v.string(),
}).index("byIds", ["id"]);
const action = createAction();
const selector = createSelector();
const prepareStartupItem = action({
  name: "prepareStartupItem",
  args: {},
  handler: function* () {
    yield* upsert(startupItemsTable, [{ id: "prepared", title: "Prepared" }]);
  },
});
const startupItemById = selector({
  name: "startupItemById",
  args: { id: v.string() },
  handler: function* ({ id }) {
    return yield* selectFrom(startupItemsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
  },
});

const navigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

afterEach(() => {
  openPersistentDriver.mockReset();
  if (navigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "navigator");
  }
});

describe("store database startup", () => {
  it.each([false, true])(
    "builds the search index once inside the shared startup lock (interrupted: %s)",
    async (interrupted) => {
      const driver = new PersistentInMemoryDriver();
      const tables = [
        ...registeredSpaceSyncableTables,
        ...searchIndexTables,
        spaceMigrationsTable,
      ];
      const persistent = new DB(driver);
      await execAsync(persistent.loadTables(tables));
      await asyncDispatch(
        persistent,
        action({
          name: "seedSearchStartup",
          args: {},
          handler: function* () {
            yield* upsert(tasksTable, [
              {
                id: "task",
                type: "task",
                title: "Milk",
                state: "todo",
                projectSectionId: "section",
                orderToken: "a0",
                createdAt: 1,
                lastToggledAt: 1,
                templateId: null,
                templateDate: null,
              },
            ]);
          },
        })({}),
      );
      openPersistentDriver.mockResolvedValue(driver);
      let lockQueue = Promise.resolve();
      let insideLock = false;
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
          locks: {
            request: <T>(_name: string, callback: () => Promise<T>) => {
              const result = lockQueue.then(async () => {
                insideLock = true;
                try {
                  return await callback();
                } finally {
                  insideLock = false;
                }
              });
              lockQueue = result.then(
                () => undefined,
                () => undefined,
              );
              return result;
            },
          },
        },
      });
      const begin = driver.beginTx.bind(driver);
      let tokenWrites = 0;
      let failNextWrite = interrupted;
      vi.spyOn(driver, "beginTx").mockImplementation(function* () {
        const tx = yield* begin();
        const upsert = tx.upsert.bind(tx);
        tx.upsert = function* (table, rows) {
          if (table === "search_tokens") {
            expect(insideLock).toBe(true);
            tokenWrites++;
            if (failNextWrite) {
              failNextWrite = false;
              throw new Error("Interrupted index rebuild");
            }
          }
          yield* upsert(table, rows);
        };
        return tx;
      });
      const config = {
        dbId: "search-startup",
        dbType: "space",
        persistDBTables: tables,
        uncachedTables: searchIndexTables,
        syncableDBTables: registeredSpaceSyncableTables,
        tableNameMap: {},
        afterInit: Effect.void,
      } satisfies SyncConfig;

      if (interrupted) {
        await expect(createStoreDbs("search-startup", config)).rejects.toThrow(
          "Interrupted index rebuild",
        );
        tokenWrites = 0;
      }

      const stores = await Promise.all([
        createStoreDbs("search-startup", config),
        createStoreDbs("search-startup", config),
      ]);
      for (const { syncSubDb } of stores) {
        expect(
          (
            await selectAsync(syncSubDb, {
              selector: searchSpace,
              args: { query: "milk", limit: 5 },
            })
          ).map((hit) => hit.type),
        ).toEqual(["task"]);
      }
      expect(tokenWrites).toBe(1);
    },
  );

  it("preloads rows written while preparing the persistent database", async () => {
    openPersistentDriver.mockResolvedValue(new PersistentInMemoryDriver());
    const syncConfig = {
      dbId: "startup-test",
      dbType: "user",
      persistDBTables: [startupItemsTable],
      syncableDBTables: [startupItemsTable],
      tableNameMap: { [startupItemsTable.tableName]: startupItemsTable },
      afterInit: Effect.void,
    } satisfies SyncConfig;

    const { persistentDB, syncSubDb } = await createStoreDbs(
      "startup-test",
      syncConfig,
      async (persistentDB) => {
        await asyncDispatch(persistentDB, prepareStartupItem({}));
      },
    );

    await expect(
      selectAsync(persistentDB, {
        selector: startupItemById,
        args: { id: "prepared" },
      }),
    ).resolves.toEqual({ id: "prepared", title: "Prepared" });
    await expect(
      selectAsync(syncSubDb, {
        selector: startupItemById,
        args: { id: "prepared" },
      }),
    ).resolves.toEqual({ id: "prepared", title: "Prepared" });
  });

  it("serializes the versioned migration check across tabs", async () => {
    let lockQueue = Promise.resolve();
    let activeLocks = 0;
    let maxActiveLocks = 0;
    const request = <T>(
      _name: string,
      callback: (lock: Lock) => Promise<T>,
    ): Promise<T> => {
      const result = lockQueue.then(async () => {
        activeLocks += 1;
        maxActiveLocks = Math.max(maxActiveLocks, activeLocks);
        try {
          return await callback({} as Lock);
        } finally {
          activeLocks -= 1;
        }
      });
      lockQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { locks: { request } },
    });

    let migrationVersion = 0;
    let migrationRuns = 0;
    const startTab = () =>
      withStoreStartupLock("space-1", async () => {
        if (migrationVersion === 1) return;
        await Promise.resolve();
        migrationRuns += 1;
        migrationVersion = 1;
      });

    await Promise.all([startTab(), startTab()]);

    expect(maxActiveLocks).toBe(1);
    expect(migrationRuns).toBe(1);
    expect(migrationVersion).toBe(1);
  });
});
