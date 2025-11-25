import {
  action,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
} from "@will-be-done/hyperdb";
import {
  generateOrderTokenPositioned,
  GenReturn,
  OrderableItem,
} from "./utils";
import { isObjectType } from "../utils";
import { registerModelSlice } from "./maps";
import { registerSyncableTable } from "./syncMap";
import { uuidv7 } from "uuidv7";

export const projectCategoryType = "projectCategory";

export type ProjectCategory = {
  type: typeof projectCategoryType;
  id: string;
  orderToken: string;
  title: string;
  projectId: string;
  createdAt: number;
};

export const isProjectCategory = isObjectType<ProjectCategory>(projectCategoryType);

export const projectCategoriesTable = table<ProjectCategory>("project_categories").withIndexes({
  byIds: { cols: ["id"], type: "btree" },
  byId: { cols: ["id"], type: "hash" },
  byProjectIdOrderToken: {
    cols: ["projectId", "orderToken"],
    type: "btree",
  },
});
registerSyncableTable(projectCategoriesTable, projectCategoryType);

export const defaultProjectCategory: ProjectCategory = {
  type: projectCategoryType,
  id: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  title: "",
  projectId: "",
  orderToken: "",
  createdAt: 0,
};

export const projectCategoriesSlice2 = {
  byId: selector(function* (id: string): GenReturn<ProjectCategory | undefined> {
    const tasks = yield* runQuery(
      selectFrom(projectCategoriesTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<ProjectCategory> {
    return (yield* projectCategoriesSlice2.byId(id)) || defaultProjectCategory;
  }),
  all: selector(function* (): GenReturn<ProjectCategory[]> {
    const tasks = yield* runQuery(
      selectFrom(projectCategoriesTable, "byProjectIdOrderToken"),
    );
    return tasks;
  }),

  byProjectId: selector(function* (projectId: string): GenReturn<ProjectCategory[]> {
    const tasks = yield* runQuery(
      selectFrom(projectCategoriesTable, "byProjectIdOrderToken").where((q) =>
        q.eq("projectId", projectId),
      ),
    );
    return tasks;
  }),

  firstChild: selector(function* (
    projectId: string,
  ): GenReturn<ProjectCategory | undefined> {
    return (yield* projectCategoriesSlice2.byProjectId(projectId))[0];
  }),
  lastChild: selector(function* (
    projectId: string,
  ): GenReturn<ProjectCategory | undefined> {
    const result = yield* projectCategoriesSlice2.byProjectId(projectId);
    if (result.length === 0) return undefined;

    return result[result.length - 1];
  }),

  create: action(function* (
    group: Partial<ProjectCategory> & { projectId: string; title: string },
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<ProjectCategory> {
    const orderToken = yield* generateOrderTokenPositioned(
      group.projectId,
      projectCategoriesSlice2,
      position,
    );

    const id = group.id || uuidv7();

    const category: ProjectCategory = {
      type: projectCategoryType,
      id,
      title: group.title,
      projectId: group.projectId,
      orderToken: orderToken,
      createdAt: Date.now(),
    };

    yield* insert(projectCategoriesTable, [category]);

    return category;
  }),
};
registerModelSlice(projectCategoriesSlice2, projectCategoriesTable, projectCategoryType);
