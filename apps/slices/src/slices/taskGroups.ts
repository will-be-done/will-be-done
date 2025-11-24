import { runQuery, selectFrom, selector, table } from "@will-be-done/hyperdb";
import { GenReturn } from "./utils";
import { isObjectType } from "../utils";
import { registerModelSlice } from "./maps";
import { registerSyncableTable } from "./syncMap";

export const taskGroupType = "taskGroup";

export type TaskGroup = {
  type: typeof taskGroupType;
  id: string;
  orderToken: string;
  title: string;
  projectId: string;
};

export const isTaskGroup = isObjectType<TaskGroup>(taskGroupType);

export const taskGroupsTable = table<TaskGroup>("task_groups").withIndexes({
  byIds: { cols: ["id"], type: "btree" },
  byId: { cols: ["id"], type: "hash" },
  byProjectIdOrderToken: {
    cols: ["projectId", "orderToken"],
    type: "btree",
  },
});
registerSyncableTable(taskGroupsTable, taskGroupType);

export const defaultTaskGroup: TaskGroup = {
  type: taskGroupType,
  id: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  title: "",
  projectId: "",
  orderToken: "",
};

export const taskGroupsSlice2 = {
  byId: selector(function* (id: string): GenReturn<TaskGroup | undefined> {
    const tasks = yield* runQuery(
      selectFrom(taskGroupsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<TaskGroup> {
    return (yield* taskGroupsSlice2.byId(id)) || defaultTaskGroup;
  }),
  all: selector(function* (): GenReturn<TaskGroup[]> {
    const tasks = yield* runQuery(
      selectFrom(taskGroupsTable, "byProjectIdOrderToken"),
    );
    return tasks;
  }),
};
registerModelSlice(taskGroupsSlice2, taskGroupsTable, taskGroupType);
