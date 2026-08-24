import {
  asyncDispatch,
  createAction,
  createSelector,
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
  it("preloads rows written while preparing the persistent database", async () => {
    openPersistentDriver.mockResolvedValue(new PersistentInMemoryDriver());
    const syncConfig = {
      dbId: "startup-test",
      dbType: "user",
      persistDBTables: [startupItemsTable],
      syncableDBTables: [startupItemsTable],
      tableNameMap: { [startupItemsTable.tableName]: startupItemsTable },
      afterInit: () => {},
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
