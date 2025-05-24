import {
  connectToDevTools,
  createStore,
  StoreApi,
  withUndoManager,
} from "@will-be-done/hyperstate";
import AwaitLock from "await-lock";
import { getDbCtx } from "@/store/sync/db";
import { Q, SyncableTable, syncableTables } from "@/store/sync/schema";
import { ChangesTracker } from "@/store/sync/ChangesTracker";
import {
  skipSyncCtx,
  syncableTypes,
  SyncMapping,
  syncMappings,
  tableModelTypeMap,
} from "@/store/sync/mapping.ts";
import { ChangesToDbSaver } from "@/store/sync/ChangesToDbSaver";
import { Selectable } from "kysely";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { Syncer } from "@/store/sync/Syncer";
import { FocusState, initialFocusState } from "@/store/slices/focusSlice.ts";
import { appSlice } from "@/store/slices/appSlice.ts";
import {
  inboxId,
  Project,
  ProjectData,
  projectsTable,
  projectType,
} from "@/store/slices/projectsSlice.ts";

import { isTask, Task, taskType } from "@/store/slices/tasksSlice.ts";
import {
  TaskTemplate,
  taskTemplateType,
} from "@/store/slices/taskTemplatesSlice.ts";
import {
  projectionType,
  TaskProjection,
} from "@/store/slices/projectionsSlice.ts";
import { DailyList, dailyListType } from "@/store/slices/dailyListsSlice.ts";

export const allTypes = [
  projectType,
  taskType,
  taskTemplateType,
  projectionType,
  dailyListType,
] as const;
export type AnyModel =
  | Project
  | Task
  | TaskTemplate
  | TaskProjection
  | DailyList;
type ModelType<T> = T extends { type: infer U } ? U : never;
type ModelTypeUnion = ModelType<AnyModel>;
export type ModelsMap = {
  [K in ModelTypeUnion]: Extract<AnyModel, { type: K }>;
};
export type SyncableState = {
  [projectType]: {
    byIds: Record<string, Project>;
  };
  [taskType]: {
    byIds: Record<string, Task>;
  };
  [taskTemplateType]: {
    byIds: Record<string, TaskTemplate>;
  };
  [projectionType]: {
    byIds: Record<string, TaskProjection>;
  };
  [dailyListType]: {
    byIds: Record<string, DailyList>;
  };
};
export type RootState = SyncableState & {
  focus: FocusState;
};
export type AppModelChange = {
  id: string;
  modelType: ModelTypeUnion;
  isDeleted: boolean;
  model: AnyModel;
};
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
            createdAt: new Date().getTime(),
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
      focus: initialFocusState,
    };

    const dbCtx = await getDbCtx();
    const bc = new BroadcastChannel(`changes-${dbCtx.clientId}2`);
    const changesToDbSaver = new ChangesToDbSaver(dbCtx.db);
    const changesTracker = new ChangesTracker(dbCtx.clientId, dbCtx.nextClock);
    const syncer = new Syncer(dbCtx, dbCtx.clientId);

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

        const model = syncMap.mapDataToModel(data);
        if (isTask(model) && !model.lastToggledAt) {
          model.lastToggledAt = new Date().getTime();
        }

        rootState[syncMap.modelType].byIds[row.id] = model;
      }
    }

    store = withUndoManager(createStore(rootState));
    connectToDevTools(store);

    syncer.startLoop();
    syncer.emitter.on("onChangePersisted", (changes) => {
      console.log("new server changes", changes);

      const modelChanges: AppModelChange[] = [];
      for (const [table, rows] of Object.entries(changes)) {
        const modelType = tableModelTypeMap[table];
        if (!modelType) throw new Error("Unknown table " + table);
        const syncMap = syncMappings[modelType];
        if (!syncMap)
          throw new Error("Sync map not found of model " + modelType);

        for (const row of rows) {
          modelChanges.push({
            id: row.id,
            modelType: syncMap.modelType,
            isDeleted: Boolean(row.isDeleted),
            // @ts-expect-error it's ok
            model: syncMap.mapDataToModel(row.data),
          });
        }
      }

      try {
        appSlice.applyChanges(
          store.withContextValue(skipSyncCtx, true),
          modelChanges,
        );
      } catch (e) {
        console.error("failed to apply changes", e);
      }

      bc.postMessage(mapChangesForBC(changes));
    });

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
