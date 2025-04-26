import { createStore, StoreApi } from "@will-be-done/hyperstate";
import AwaitLock from "await-lock";
import { RootState } from "./models2";
import { getDbCtx } from "@/sync/db";
import { ProjectData, projectsTable, Q } from "@/sync/schema";

let store: StoreApi<RootState>;

const lock = new AwaitLock();
export const initStore = async (): Promise<StoreApi<RootState>> => {
  await lock.acquireAsync();
  try {
    if (store) {
      return store;
    }
    const rootState: RootState = {
      projects: { byIds: {} },
      tasks: { byIds: {} },
      taskTemplates: { byIds: {} },
      taskProjections: { byIds: {} },
      dailyLists: { byIds: {} },
    };

    const dbCtx = await getDbCtx();

    const rows = await dbCtx.db.runQuery(
      Q.selectFrom(projectsTable).selectAll().where("isDeleted", "=", 0),
    );

    for (const row of rows) {
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
