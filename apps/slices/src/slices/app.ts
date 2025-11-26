import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { defaultTask } from "./tasks";
import { AnyModel, appTypeSlicesMap } from "./maps";

// Slice
export const appSlice2 = {
  // selectors
  byId: selector(function* (id: string): GenReturn<AnyModel | undefined> {
    for (const slice of Object.values(appTypeSlicesMap)) {
      const item = yield* slice.byId(id);
      if (item) return item;
    }

    return undefined;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<AnyModel> {
    const entity = yield* appSlice2.byId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  canDrop: selector(function* (id: string, dropId: string): GenReturn<boolean> {
    const model = yield* appSlice2.byId(id);
    if (!model) return false;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    return yield* slice.canDrop(id, dropId);
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const model = yield* appSlice2.byId(id);
    if (!model) return;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.handleDrop(id, dropId, edge);
  }),

  delete: action(function* (model: AnyModel): GenReturn<void> {
    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error("Unknown model type");

    yield* slice.delete([model.id]);
  }),
};
