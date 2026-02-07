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
import {
  generateOrderTokenPositioned,
  GenReturn,
  OrderableItem,
} from "./utils";
import { isObjectType } from "../utils";
import { registerModelSlice, AnyModelType } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";
import { uuidv7 } from "uuidv7";
import { defaultProject, Project, projectsSlice } from "./projects";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { Task, cardsTasksSlice, isTask } from "./cardsTasks";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { appSlice } from "./app";
import { isTaskTemplate } from "./cardsTaskTemplates";
import { cardsSlice } from "./cards";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { isTaskProjection } from "./dailyListsProjections";

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

export const projectCategoriesSlice = {
  byId: selector(function* (
    id: string,
  ): GenReturn<ProjectCategory | undefined> {
    const tasks = yield* runQuery(
      selectFrom(projectCategoriesTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<ProjectCategory> {
    return (yield* projectCategoriesSlice.byId(id)) || defaultProjectCategory;
  }),
  all: selector(function* (): GenReturn<ProjectCategory[]> {
    const tasks = yield* runQuery(
      selectFrom(projectCategoriesTable, "byProjectIdOrderToken"),
    );
    return tasks;
  }),

  byProjectId: selector(function* (
    projectId: string,
  ): GenReturn<ProjectCategory[]> {
    return yield* projectCategoriesSlice.byProjectIds([projectId]);
  }),

  byProjectIds: selector(function* (
    projectIds: string[],
  ): GenReturn<ProjectCategory[]> {
    const categories = yield* runQuery(
      selectFrom(projectCategoriesTable, "byProjectIdOrderToken").where((q) =>
        projectIds.map((id) => q.eq("projectId", id)),
      ),
    );
    return categories;
  }),

  projectOfCategory: selector(function* (
    categoryId: string,
  ): GenReturn<Project | undefined> {
    const category = yield* projectCategoriesSlice.byId(categoryId);
    if (!category) return undefined;

    return yield* projectsSlice.byId(category.projectId);
  }),
  projectOfCategoryOrDefault: selector(function* (
    categoryId: string,
  ): GenReturn<Project> {
    const category = yield* projectCategoriesSlice.byId(categoryId);
    if (!category) return defaultProject;

    return yield* projectsSlice.byIdOrDefault(category.projectId);
  }),

  firstChild: selector(function* (
    projectId: string,
  ): GenReturn<ProjectCategory | undefined> {
    return (yield* projectCategoriesSlice.byProjectId(projectId))[0];
  }),
  lastChild: selector(function* (
    projectId: string,
  ): GenReturn<ProjectCategory | undefined> {
    const result = yield* projectCategoriesSlice.byProjectId(projectId);
    if (result.length === 0) return undefined;

    return result[result.length - 1];
  }),

  updateCategory: action(function* (
    categoryId: string,
    category: Partial<ProjectCategory>,
  ): GenReturn<void> {
    const categoryInState = yield* projectCategoriesSlice.byId(categoryId);
    if (!categoryInState) throw new Error("Category not found");

    yield* update(projectCategoriesTable, [
      { ...categoryInState, ...category },
    ]);
  }),

  siblings: selector(function* (
    categoryId: string,
  ): GenReturn<[ProjectCategory | undefined, ProjectCategory | undefined]> {
    const item = yield* projectCategoriesSlice.byId(categoryId);
    if (!item) return [undefined, undefined];

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

    const before = beforeId
      ? yield* projectCategoriesSlice.byIdOrDefault(beforeId)
      : undefined;
    const after = afterId
      ? yield* projectCategoriesSlice.byIdOrDefault(afterId)
      : undefined;

    return [before, after];
  }),

  moveLeft: action(function* (categoryId: string): GenReturn<void> {
    const [up] = yield* projectCategoriesSlice.siblings(categoryId);
    const [up2] = up
      ? yield* projectCategoriesSlice.siblings(up?.id)
      : [undefined, undefined];

    if (!up) return;

    yield* projectCategoriesSlice.updateCategory(categoryId, {
      orderToken: generateJitteredKeyBetween(
        up2?.orderToken || null,
        up.orderToken,
      ),
    });
  }),

  moveRight: action(function* (categoryId: string): GenReturn<void> {
    const [_up, down] = yield* projectCategoriesSlice.siblings(categoryId);
    const [_up2, down2] = down
      ? yield* projectCategoriesSlice.siblings(down?.id)
      : [undefined, undefined];

    if (!down) return;

    yield* projectCategoriesSlice.updateCategory(categoryId, {
      orderToken: generateJitteredKeyBetween(
        down.orderToken,
        down2?.orderToken || null,
      ),
    });
  }),

  createCategory: action(function* (
    categoryDraft: Partial<ProjectCategory> & {
      projectId: string;
      title: string;
    },
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<ProjectCategory> {
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
  }),

  createTask: action(function* (
    categoryId: string,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    taskAttrs?: Partial<Task>,
  ): GenReturn<Task> {
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
  }),

  delete: action(function* (ids: string[]): GenReturn<void> {
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
  }),

  handleDrop: action(function* (
    categoryId: string,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const dropItem = yield* appSlice.byId(dropId, dropModelType);
    if (!dropItem) return;

    const childrenIds =
      yield* projectCategoryCardsSlice.childrenIds(categoryId);
    let orderToken: string;
    if (childrenIds.length === 0) {
      orderToken = generateJitteredKeyBetween(null, null);
    } else if (edge === "top") {
      const first =
        yield* projectCategoryCardsSlice.byIdOrDefault(childrenIds[0]);
      orderToken = generateJitteredKeyBetween(null, first.orderToken || null);
    } else {
      const last = yield* projectCategoryCardsSlice.byIdOrDefault(
        childrenIds[childrenIds.length - 1],
      );
      orderToken = generateJitteredKeyBetween(last.orderToken || null, null);
    }

    if (isTask(dropItem)) {
      yield* cardsTasksSlice.update(dropItem.id, {
        projectCategoryId: categoryId,
        orderToken,
      });
    } else if (isTaskProjection(dropItem)) {
      // When dropping a projection onto a category, move the underlying task
      const task = yield* cardsTasksSlice.byId(dropItem.id);
      if (task) {
        yield* cardsTasksSlice.update(task.id, {
          projectCategoryId: categoryId,
          orderToken,
        });
        // Keep the projection in the daily list
      }
    }
  }),
  canDrop: selector(function* (
    _categoryId: string,
    dropId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
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
  }),
};

registerModelSlice(
  projectCategoriesSlice,
  projectCategoriesTable,
  projectCategoryType,
);
