import { createStore, StoreApi } from "@will-be-done/hyperstate";
import AwaitLock from "await-lock";
import { projectsSelectors, RootState, TaskState } from "./models2";
import { getDbCtx } from "@/sync/db";
import {
  ProjectData,
  projectsTable,
  Q,
  TaskData,
  tasksTable,
} from "@/sync/schema";
import { produce } from "immer";

let store: StoreApi<RootState>;

const lock = new AwaitLock();
export const initStore = async (): Promise<StoreApi<RootState>> => {
  await lock.acquireAsync();
  try {
    if (store) {
      return store;
    }
    const rootState: RootState = {
      projects: {
        byIds: {},
      },
      tasks: {
        byIds: {},
      },
      taskTemplates: {
        byIds: {},
      },
      taskProjections: { byIds: {} },
      dailyLists: { byIds: {} },
    };

    const dbCtx = await getDbCtx();

    const projectRows = await dbCtx.db.runQuery(
      Q.selectFrom(projectsTable).selectAll().where("isDeleted", "=", 0),
    );

    for (const row of projectRows) {
      const data = JSON.parse(row.data as unknown as string) as ProjectData;

      rootState.projects.byIds[row.id] = {
        type: "project",
        id: row.id,
        title: data.title,
        icon: data.icon,
        isInbox: data.isInbox,
        orderToken: data.orderToken,
      };
    }

    const todoRows = await dbCtx.db.runQuery(
      Q.selectFrom(tasksTable).selectAll().where("isDeleted", "=", 0),
    );

    for (const row of todoRows) {
      const data = JSON.parse(row.data as unknown as string) as TaskData;

      rootState.tasks.byIds[row.id] = {
        type: "task",
        id: row.id,
        title: data.title,
        state: data.state as TaskState,
        projectId: data.projectId,
        orderToken: data.orderToken,
      };
    }

    store = createStore(rootState);
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
