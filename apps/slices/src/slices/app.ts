import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { defaultTask } from "./cardsTasks";
import { AnyModel, appTypeSlicesMap } from "./maps";

export type DndScope = "dailyList" | "project" | "global";

// Slice
export const appSlice = {
  // selectors
  // TODO: byIdAndType
  byId: selector(function* (id: string): GenReturn<AnyModel | undefined> {
    for (const slice of Object.values(appTypeSlicesMap)) {
      const item = yield* slice.byId(id);
      if (item) return item;
    }

    return undefined;
  }),
  // TODO: byIdAndType
  byIdOrDefault: selector(function* (id: string): GenReturn<AnyModel> {
    const entity = yield* appSlice.byId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  canDrop: selector(function* (
    id: string,
    scope: DndScope,
    dropId: string,
    dropScope: DndScope,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(id);
    if (!model) return false;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    return yield* slice.canDrop(id, scope, dropId, dropScope);
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    scope: DndScope,
    dropId: string,
    dropScope: DndScope,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const model = yield* appSlice.byId(id);
    if (!model) return;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.handleDrop(id, scope, dropId, dropScope, edge);
  }),

  delete: action(function* (model: AnyModel): GenReturn<void> {
    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.delete([model.id]);
  }),
};
