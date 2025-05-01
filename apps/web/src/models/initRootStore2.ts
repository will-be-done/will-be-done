import { createStore, StoreApi } from "@will-be-done/hyperstate";
import AwaitLock from "await-lock";
import {
  AppModelChange,
  appSlice,
  dailyListType,
  inboxId,
  projectionType,
  projectType,
  RootState,
  taskTemplateType,
  taskType,
} from "./models2";
import { getDbCtx } from "@/sync/db";
import {
  ProjectData,
  projectsTable,
  Q,
  SyncableTable,
  syncableTables,
} from "@/sync/schema";
import { ChangesTracker } from "@/sync2/ChangesTracker";
import {
  skipSyncCtx,
  syncableTypes,
  SyncMapping,
  syncMappings,
  tableModelTypeMap,
} from "@/sync2/main";
import { ChangesToDbSaver } from "@/sync/ChangesToDbSaver";
import { Selectable } from "kysely";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { Syncer } from "@/sync/Syncer";

let store: StoreApi<RootState>;

type BroadcastChanges = Record<(typeof syncableTypes)[number], string[]>;

const mapChangesForBC = (
  changes: Record<(typeof syncableTables)[number], { id: string }[]>,
) => {
  const res: BroadcastChanges = {
    [projectType]: [],
    [taskType]: [],
    [taskTemplateType]: [],
    [projectionType]: [],
    [dailyListType]: [],
  };

  for (const [table, data] of Object.entries(changes)) {
    const modelType = tableModelTypeMap[table];
    if (!modelType) throw new Error("Unknown table " + table);

    res[modelType] = data.map((d) => d.id);
  }
  return res;
};

const lock = new AwaitLock();
export const initStore = async (): Promise<StoreApi<RootState>> => {
  await lock.acquireAsync();
  try {
    if (store) {
      return store;
    }
    const rootState: RootState = {
      project: {
        byIds: {
          [inboxId]: {
            type: projectType,
            id: inboxId,
            title: "Inbox",
            icon: "",
            isInbox: true,
            orderToken: generateJitteredKeyBetween(null, null),
          },
        },
      },
      task: {
        byIds: {},
      },
      template: {
        byIds: {},
      },
      projection: { byIds: {} },
      dailyList: { byIds: {} },
    };

    const dbCtx = await getDbCtx();
    const bc = new BroadcastChannel(`changes-${dbCtx.clientId}2`);
    const changesToDbSaver = new ChangesToDbSaver(dbCtx.db);
    const changesTracker = new ChangesTracker(dbCtx.clientId, dbCtx.nextClock);
    // const syncer = new Syncer(dbCtx, dbCtx.clientId);

    const allData = await Promise.all(
      syncableTypes.map(async (modelType) => {
        const syncMap = syncMappings[modelType];
        const rows = await dbCtx.db.runQuery(
          Q.selectFrom(syncMap.table as typeof projectsTable)
            .selectAll()
            .where("isDeleted", "=", 0),
        );

        return [syncMap, rows] satisfies [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          SyncMapping<any, any>,
          Selectable<SyncableTable>[],
        ];
      }),
    );

    for (const [syncMap, rows] of allData) {
      for (const row of rows) {
        const data = JSON.parse(row.data as unknown as string) as ProjectData;

        rootState[syncMap.modelType].byIds[row.id] =
          syncMap.mapDataToModel(data);
      }
    }

    console.log("final rootState", rootState);

    store = createStore(rootState);

    // syncer.startLoop();
    // syncer.emitter.on("onChangePersisted", (changes) => {
    //   console.log("new server changes", changes);
    //
    //   const modelChanges: AppModelChange[] = [];
    //   for (const [table, rows] of Object.entries(changes)) {
    //     const modelType = tableModelTypeMap[table];
    //     if (!modelType) throw new Error("Unknown table " + table);
    //     const syncMap = syncMappings[modelType];
    //     if (!syncMap)
    //       throw new Error("Sync map not found of model " + modelType);
    //
    //     for (const row of rows) {
    //       modelChanges.push({
    //         id: row.id,
    //         modelType: syncMap.modelType,
    //         isDeleted: Boolean(row.isDeleted),
    //         // @ts-expect-error it's ok
    //         model: syncMap.mapDataToModel(row.data),
    //       });
    //     }
    //   }
    //
    //   try {
    //     appSlice.applyChanges(
    //       store.withContextValue(skipSyncCtx, true),
    //       modelChanges,
    //     );
    //   } catch (e) {
    //     console.error("failed to apply changes", e);
    //   }
    //
    //   bc.postMessage(mapChangesForBC(changes));
    // });

    changesToDbSaver.emitter.on("onChangePersisted", (changes) => {
      bc.postMessage(mapChangesForBC(changes));
    });

    store.subscribe((store, state, prevState, patches) => {
      if (store.getContextValue(skipSyncCtx)) {
        return;
      }

      const modelChanges = changesTracker.handleChange(
        store,
        state,
        prevState,
        patches,
      );
      console.log("modelChanges", modelChanges);

      for (const ch of modelChanges) {
        changesToDbSaver.addChange(ch);
      }
    });

    bc.onmessage = async (ev) => {
      const data = ev.data as BroadcastChanges;

      const modelChanges: AppModelChange[] = [];
      for (const [modelType, ids] of Object.entries(data)) {
        if (!ids || ids.length === 0) continue;
        const syncMap =
          syncMappings[modelType as (typeof syncableTypes)[number]];

        if (!syncMap)
          throw new Error("Sync map not found of model " + modelType);

        const rows = await dbCtx.db.runQuery(
          Q.selectFrom(syncMap.table as typeof projectsTable)
            .selectAll()
            .where("id", "in", ids),
        );

        for (const row of rows) {
          const data = JSON.parse(row.data as unknown as string) as ProjectData;
          modelChanges.push({
            id: row.id,
            modelType: syncMap.modelType,
            isDeleted: Boolean(row.isDeleted),
            model: syncMap.mapDataToModel(data),
          });
        }
      }

      appSlice.applyChanges(
        store.withContextValue(skipSyncCtx, true),
        modelChanges,
      );
    };

    console.log("SECOND INIT STORE DONE", store.getState());
    return store;
  } finally {
    lock.release();
  }
};

export const getStore = () => {
  if (!store) {
    throw new Error("Store not initialized");
  }

  return store;
};
// if (import.meta.hot) {
//   import.meta.hot.accept((newModule) => {
//     if (newModule) {
//       console.log("new module", newModule);
//     }
//   });
// }
