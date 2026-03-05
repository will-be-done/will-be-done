import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { generateOrderTokenPositioned, OrderableItem } from "./utils";
import { isObjectType } from "../utils";
import { registerModelSlice, AnyModelType } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";
import { uuidv7 } from "uuidv7";
import { projectsSlice } from ".";
import { defaultProject, Project } from "./projects";
import { projectCategoryCardsSlice } from ".";
import { cardsTasksSlice } from ".";
import { Task, isTask } from "./cardsTasks";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { appSlice } from ".";
import { isTaskTemplate } from "./cardsTaskTemplates";
import { cardsSlice } from ".";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { isTaskProjection } from "./dailyListsProjections";
import { genUUIDV5 } from "../traits";

export const projectCategoryType = "projectCategory";

export type ProjectCategory = {
  type: typeof projectCategoryType;
  id: string;
  orderToken: string;
  title: string;
  projectId: string;
  createdAt: number;
};

export const isProjectCategory =
  isObjectType<ProjectCategory>(projectCategoryType);

export const projectCategoriesTable = table<ProjectCategory>(
  "project_categories",
).withIndexes({
  byIds: { cols: ["id"], type: "btree" },
  byId: { cols: ["id"], type: "hash" },
  byProjectIdOrderToken: {
    cols: ["projectId", "orderToken"],
    type: "btree",
  },
});
registerSpaceSyncableTable(projectCategoriesTable, projectCategoryType);

export const defaultProjectCategory: ProjectCategory = {
  type: projectCategoryType,
  id: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  title: "",
  projectId: "",
  orderToken: "",
  createdAt: 0,
};

export const byId = selector(function* (id: string) {
  const tasks = yield* runQuery(
    selectFrom(projectCategoriesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );

  return tasks[0] as ProjectCategory | undefined;
});

export const byIdOrDefault = selector(function* (id: string) {
  return (yield* byId(id)) || defaultProjectCategory;
});

export const all = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(projectCategoriesTable, "byProjectIdOrderToken"),
  );
  return tasks;
});

export const inboxCategoryId = selector(function* () {
  return yield* genUUIDV5(projectCategoryType, "inbox");
});

export const byProjectIds = selector(function* (projectIds: string[]) {
  const categories = yield* runQuery(
    selectFrom(projectCategoriesTable, "byProjectIdOrderToken").where((q) =>
      projectIds.map((id) => q.eq("projectId", id)),
    ),
  );
  return categories;
});

export const byProjectId = selector(function* (projectId: string) {
  return yield* byProjectIds([projectId]);
});

export const projectOfCategory = selector(function* (
  categoryId: string,
): Generator<unknown, Project | undefined, unknown> {
  const category = yield* byId(categoryId);
  if (!category) return undefined;

  return yield* projectsSlice.byId(category.projectId);
});

export const projectOfCategoryOrDefault = selector(function* (
  categoryId: string,
): Generator<unknown, Project, unknown> {
  const category = yield* byId(categoryId);
  if (!category) return defaultProject;

  return yield* projectsSlice.byIdOrDefault(category.projectId);
});

export const firstChild = selector(function* (projectId: string) {
  return (yield* byProjectId(projectId))[0] as ProjectCategory | undefined;
});

export const lastChild = selector(function* (projectId: string) {
  const result = yield* byProjectId(projectId);
  if (result.length === 0) return undefined as ProjectCategory | undefined;

  return result[result.length - 1] as ProjectCategory | undefined;
});

export const updateCategory = action(function* (
  categoryId: string,
  category: Partial<ProjectCategory>,
): Generator<unknown, void, unknown> {
  const categoryInState = yield* byId(categoryId);
  if (!categoryInState) throw new Error("Category not found");

  yield* update(projectCategoriesTable, [{ ...categoryInState, ...category }]);
});

export const siblings = selector(function* (categoryId: string) {
  const item = yield* byId(categoryId);
  if (!item)
    return [undefined, undefined] as [
      ProjectCategory | undefined,
      ProjectCategory | undefined,
    ];

  const sortedProjectCategories = yield* runQuery(
    selectFrom(projectCategoriesTable, "byProjectIdOrderToken").where((q) =>
      q.eq("projectId", item.projectId),
    ),
  );

  const index = sortedProjectCategories.findIndex((p) => p.id === categoryId);

  const beforeId =
    index > 0 ? sortedProjectCategories[index - 1].id : undefined;
  const afterId =
    index < sortedProjectCategories.length - 1
      ? sortedProjectCategories[index + 1].id
      : undefined;

  const before = beforeId ? yield* byIdOrDefault(beforeId) : undefined;
  const after = afterId ? yield* byIdOrDefault(afterId) : undefined;

  return [before, after] as [
    ProjectCategory | undefined,
    ProjectCategory | undefined,
  ];
});

export const moveLeft = action(function* (
  categoryId: string,
): Generator<unknown, void, unknown> {
  const [up] = yield* siblings(categoryId);
  const [up2] = up ? yield* siblings(up?.id) : [undefined, undefined];

  if (!up) return;

  yield* updateCategory(categoryId, {
    orderToken: generateJitteredKeyBetween(
      up2?.orderToken || null,
      up.orderToken,
    ),
  });
});

export const moveRight = action(function* (
  categoryId: string,
): Generator<unknown, void, unknown> {
  const [_up, down] = yield* siblings(categoryId);
  const [_up2, down2] = down
    ? yield* siblings(down?.id)
    : [undefined, undefined];

  if (!down) return;

  yield* updateCategory(categoryId, {
    orderToken: generateJitteredKeyBetween(
      down.orderToken,
      down2?.orderToken || null,
    ),
  });
});

export const createCategory = action(function* (
  categoryDraft: Partial<ProjectCategory> & {
    projectId: string;
    title: string;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
): Generator<unknown, ProjectCategory, unknown> {
  const orderToken = yield* generateOrderTokenPositioned(
    categoryDraft.projectId,
    projectCategoriesSlice,
    position,
  );

  const id = categoryDraft.id || uuidv7();

  const category: ProjectCategory = {
    type: projectCategoryType,
    id,
    title: categoryDraft.title,
    projectId: categoryDraft.projectId,
    orderToken: orderToken,
    createdAt: Date.now(),
  };

  yield* insert(projectCategoriesTable, [category]);

  return category;
});

export const createTask = action(function* (
  categoryId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  taskAttrs?: Partial<Task>,
): Generator<unknown, Task, unknown> {
  const orderToken = yield* generateOrderTokenPositioned(
    categoryId,
    projectCategoryCardsSlice,
    position,
  );

  return yield* cardsTasksSlice.createTask({
    ...taskAttrs,
    orderToken: orderToken,
    projectCategoryId: categoryId,
  });
});

export const deleteCategories = action(function* (
  ids: string[],
): Generator<unknown, void, unknown> {
  const idsToDelete: string[] = [];

  for (const categoryId of ids) {
    const childrenIds =
      yield* projectCategoryCardsSlice.childrenIds(categoryId);
    const doneChildrenIds =
      yield* projectCategoryCardsSlice.doneChildrenIds(categoryId);

    idsToDelete.push(...childrenIds, ...doneChildrenIds);
  }

  if (idsToDelete.length > 0) {
    yield* cardsSlice.deleteByIds(idsToDelete);
  }

  yield* deleteRows(projectCategoriesTable, ids);
});

export const handleDrop = action(function* (
  categoryId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const dropItem = yield* appSlice.byId(dropId, dropModelType);
  if (!dropItem) return;

  const childrenIds = yield* projectCategoryCardsSlice.childrenIds(categoryId);
  let orderToken: string;
  if (childrenIds.length === 0) {
    orderToken = generateJitteredKeyBetween(null, null);
  } else if (edge === "top") {
    const first = yield* projectCategoryCardsSlice.byIdOrDefault(
      childrenIds[0],
    );
    orderToken = generateJitteredKeyBetween(null, first.orderToken || null);
  } else {
    const last = yield* projectCategoryCardsSlice.byIdOrDefault(
      childrenIds[childrenIds.length - 1],
    );
    orderToken = generateJitteredKeyBetween(last.orderToken || null, null);
  }

  if (isTask(dropItem)) {
    yield* cardsTasksSlice.updateTask(dropItem.id, {
      projectCategoryId: categoryId,
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    // When dropping a projection onto a category, move the underlying task
    const task = yield* cardsTasksSlice.byId(dropItem.id);
    if (task) {
      yield* cardsTasksSlice.updateTask(task.id, {
        projectCategoryId: categoryId,
        orderToken,
      });
      // Keep the projection in the daily list
    }
  }
});

export const canDrop = selector(function* (
  _categoryId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  yield* noop();

  const dropItem = yield* appSlice.byId(dropId, dropModelType);
  if (!dropItem) return false;

  if (isTask(dropItem) || isTaskTemplate(dropItem)) {
    return true;
  }

  if (isTaskProjection(dropItem)) {
    const task = yield* cardsTasksSlice.byId(dropItem.id);
    return task !== undefined && task.state === "todo";
  }

  return false;
});

const projectCategoriesSlice = {
  byId,
  byIdOrDefault,
  all,
  inboxCategoryId,
  byProjectId,
  byProjectIds,
  projectOfCategory,
  projectOfCategoryOrDefault,
  firstChild,
  lastChild,
  updateCategory,
  siblings,
  moveLeft,
  moveRight,
  createCategory,
  createTask,
  delete: deleteCategories,
  handleDrop,
  canDrop,
};

registerModelSlice(
  projectCategoriesSlice,
  projectCategoriesTable,
  projectCategoryType,
);
