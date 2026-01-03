import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { defaultTask, isTask } from "./cardsTasks";
import { AnyModel, appTypeSlicesMap } from "./maps";
import { dailyListTasksSlice } from "./dailyListTasks";

// Slice
export const appSlice = {
  // selectors
  byId: selector(function* (id: string): GenReturn<AnyModel | undefined> {
    for (const slice of Object.values(appTypeSlicesMap)) {
      const item = yield* slice.byId(id);
      if (item) return item;
    }

    return undefined;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<AnyModel> {
    const entity = yield* appSlice.byId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  canDrop: selector(function* (
    id: string,
    dropId: string,
    scope: "dailyList" | "project" | "global",
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(id);
    if (!model) return false;

    if (scope === "dailyList" && isTask(model)) {
      return yield* dailyListTasksSlice.canDrop(id, dropId);
    }

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    return yield* slice.canDrop(id, dropId, scope);
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    dropId: string,
    edge: "top" | "bottom",
    scope: "dailyList" | "project" | "global",
  ): GenReturn<void> {
    const model = yield* appSlice.byId(id);
    if (!model) return;

    if (scope === "dailyList" && isTask(model)) {
      yield* dailyListTasksSlice.handleDrop(id, dropId, edge);

      return;
    }

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.handleDrop(id, dropId, edge, scope);
  }),

  delete: action(function* (model: AnyModel): GenReturn<void> {
    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.delete([model.id]);
  }),
};
