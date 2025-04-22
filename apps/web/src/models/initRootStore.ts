import { ChangesToDbSaver } from "@/sync/ChangesToDbSaver";
import { ChangesTracker } from "@/sync/ChangesTracker";
import { getDbCtx } from "@/sync/db";
import { Q, SyncableTable, SyncableTables, projectsTable } from "@/sync/schema";
import {
  buildAndAttachEmitter,
  buildAndAttachSyncRegStore,
  SyncableRegistry,
} from "@/sync/syncable";
import { registerRootStore, UndoManager, undoMiddleware } from "mobx-keystone";
import { RootStore } from "./models";
import AwaitLock from "await-lock";
import { Syncer } from "@/sync/Syncer";
import { Selectable } from "kysely";

export const lock = new AwaitLock();
export let currentRootStore: RootStore | undefined;

export const getRootStore = () => {
  if (currentRootStore) return currentRootStore;

  throw new Error("Root store not initialized");
};

let undoManager: UndoManager | undefined = undefined;

export const getUndoManager = () => {
  if (undoManager) return undoManager;

  const rootStore = getRootStore();
  undoManager = undoMiddleware(rootStore);

  return undoManager;
};

const mapChangesForBC = (
  changes: Record<string, Selectable<SyncableTable>[]>,
) => {
  const res: Record<string, string[]> = {};

  for (const [table, chs] of Object.entries(changes)) {
    res[table] = chs.map((ch) => ch.id);
  }
  return res;
};

export const initRootStore = async () => {
  await lock.acquireAsync();
  try {
    if (currentRootStore) return currentRootStore;

    console.log("initRootStore", "1");
    const dbCtx = await getDbCtx();
    console.log("initRootStore", "2");

    const rootStore = new RootStore({});
    const modelChangesEmitter = buildAndAttachEmitter(rootStore);
    const syncableRegistriesStore = buildAndAttachSyncRegStore(rootStore);
    const changesTracker = new ChangesTracker(
      dbCtx.clientId,
      dbCtx.nextClock,
      syncableRegistriesStore,
    );
    const changesToDbSaver = new ChangesToDbSaver(dbCtx.db);
    const syncer = new Syncer(dbCtx, dbCtx.clientId);
    const bc = new BroadcastChannel(`changes-${dbCtx.clientId}`);

    syncer.emitter.on("onChangePersisted", (changes) => {
      rootStore.applyChanges(syncableRegistriesStore, changes);

      bc.postMessage(mapChangesForBC(changes));
    });
    changesToDbSaver.emitter.on("onChangePersisted", (changes) => {
      bc.postMessage(mapChangesForBC(changes));
    });

    bc.onmessage = async (ev) => {
      console.log("bc.onmessage", ev);
      const data = ev.data as Record<string, string[]>;

      const allData = await Promise.all(
        Object.entries(data).map(async ([table, ids]) => {
          if (!ids || ids.length === 0) return;

          const registry = syncableRegistriesStore.getRegistryOfTable(
            table as keyof SyncableTables,
          );
          if (!registry)
            throw new Error("Registry not found of table " + table);

          const rows = await dbCtx.db.runQuery(
            Q.selectFrom(registry.table as typeof projectsTable)
              .selectAll()
              .where("id", "in", ids),
          );

          return [registry, rows] satisfies [
            SyncableRegistry,
            Selectable<SyncableTable>[],
          ];
        }),
      );

      rootStore.loadData(allData.filter((e) => e !== undefined));
    };

    registerRootStore(rootStore);

    // const allData: [SyncableRegistry, Record<string, any>[]][] = [];
    const allData = await Promise.all(
      syncableRegistriesStore.registries.map(async (registry) => {
        const rows = await dbCtx.db.runQuery(
          Q.selectFrom(registry.table as typeof projectsTable)
            .selectAll()
            .where("isDeleted", "=", 0),
        );

        return [registry, rows] satisfies [
          SyncableRegistry,
          Selectable<SyncableTable>[],
        ];
      }),
    );

    // for (const registry of syncableRegistriesStore.registries) {
    //   const rows = await dbCtx.db.runQuery(
    //     Q.selectFrom(registry.table as typeof projectsTable)
    //       .selectAll()
    //       .where("isDeleted", "=", 0),
    //   );
    //
    //   allData.push([registry, rows]);
    // }
    rootStore.loadData(allData);

    modelChangesEmitter.on("modelEvent", (change) => {
      const ch = changesTracker.handleChange(change);
      if (!ch) return;

      changesToDbSaver.addChange(ch);
    });

    syncer.startLoop();

    // withoutSync(() => {
    //   const stateObj = JSON.parse(
    //     localStorage.getItem("state") || "{}",
    //   ) as SnapshotOutOfModel<RootStore>;
    //   applySnapshot(rootStore, stateObj);
    // });
    // Very low performance, so used only in development
    const addToolkit = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      if ((window as any).__REDUX_DEVTOOLS_EXTENSION__) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        await (
          await import("./connectReduxDevtool")
        ).connect(rootStore, `TODO Store`);
      }
    };

    // Very low performance, so used only in development
    if (process.env.NODE_ENV === "development") {
      void addToolkit();
    }
    // But you can call it from console in prod
    // @ts-expect-error for console call
    window.addToolkit = addToolkit;

    const projects = [{ id: "inbox", name: "Inbox", icon: "" }];

    for (const project of projects) {
      let projectFound = false;

      console.log("checking project", project);
      for (const pr of rootStore.projectsRegistry.entities.values()) {
        if (pr.title === project.name) {
          projectFound = true;
        }
      }

      if (projectFound) {
        continue;
      }

      rootStore.projectsRegistry.createProject(
        project.name,
        project.icon,
        project.id === "inbox",
        undefined,
      );
    }

    // const client = makeClient();
    //
    // void (async () => {
    //   while (true) {
    //     let baseQ = Q.selectFrom(syncableTables[0] as typeof projectsTable)
    //       .where("needSync", "=", 1)
    //       .select([
    //         "id",
    //         "isDeleted",
    //         "data",
    //         "lastUpdatedOnClientAt",
    //         sql<string>`'${sql.raw(projectsTable)}'`.as("tableName"),
    //       ]);
    //
    //     for (const t of syncableTables.slice(1)) {
    //       baseQ = baseQ.unionAll(
    //         Q.selectFrom(t as typeof projectsTable)
    //           .select([
    //             "id",
    //             "isDeleted",
    //             "data",
    //             "lastUpdatedOnClientAt",
    //             sql<string>`'${sql.raw(t)}'`.as("tableName"),
    //           ])
    //           .where("needSync", "=", 1),
    //       );
    //     }
    //
    //     const data = await dbCtx.db.runQuery(baseQ);
    //
    //     // TODO: use kysely wa-sqlite
    //     const serverChanges = data.map((d) => ({
    //       id: d.id,
    //       isDeleted: d.isDeleted,
    //       data: d.data as unknown as string,
    //       tableName: d.tableName,
    //       lastUpdatedOnClientAt: d.lastUpdatedOnClientAt,
    //     }));
    //
    //     const res = await client.applyChanges.mutate({
    //       changes: serverChanges,
    //       lastServerClock: null,
    //     });
    //
    //     const toUpdate = groupBy(serverChanges, (c) => c.tableName);
    //
    //     await dbCtx.db.runInTransaction(async (db) => {
    //       await db.runQuery(
    //         Q.insertInto(preferencesTable).orReplace().values({
    //           key: "lastAppliedClock",
    //           value: res.lastAppliedClock,
    //         }),
    //       );
    //
    //       await Promise.all(
    //         Object.entries(toUpdate).map(async ([table, changes]) => {
    //           await db.runQuery(
    //             Q.updateTable(table as typeof projectsTable)
    //               .set({ needSync: 0 })
    //               .where((eb) => {
    //                 const ands = changes.map((c) => {
    //                   return eb.and([
    //                     eb("id", "=", c.id),
    //                     eb("lastUpdatedOnClientAt", "=", res.lastAppliedClock),
    //                   ]);
    //                 });
    //
    //                 return eb.or(ands);
    //               }),
    //           );
    //         }),
    //       );
    //     });
    //
    //     await new Promise((resolve) => setTimeout(resolve, 5000));
    //   }
    // })();

    currentRootStore = rootStore;
    // @ts-expect-error for console call
    window.rootStore = rootStore;
    return rootStore;
  } finally {
    lock.release();
  }
};
