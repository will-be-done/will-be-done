import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { defaultTask } from "./cardsTasks";
import { AnyModel, AnyModelType, appTypeSlicesMap } from "./maps";

// Slice
export const appSlice = {
  // selectors
  byId: selector(function* (
    id: string,
    modelType: AnyModelType,
  ): GenReturn<AnyModel | undefined> {
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);
    return yield* slice.byId(id);
  }),

  byIdOrDefault: selector(function* (
    id: string,
    modelType: AnyModelType,
  ): GenReturn<AnyModel> {
    const entity = yield* appSlice.byId(id, modelType);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  canDrop: selector(function* (
    id: string,
    modelType: AnyModelType,
    dropId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(id, modelType);
    if (!model) return false;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error(`Unknown model type: ${model.type}`);

    return yield* slice.canDrop(id, dropId, dropModelType);
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    modelType: AnyModelType,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const model = yield* appSlice.byId(id, modelType);
    if (!model) return;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error(`Unknown model type: ${model.type}`);

    yield* slice.handleDrop(id, dropId, dropModelType, edge);
  }),

  delete: action(function* (
    id: string,
    modelType: AnyModelType,
  ): GenReturn<void> {
    const model = yield* appSlice.byId(id, modelType);
    if (!model) return;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error(`Unknown model type: ${model.type}`);

    yield* slice.delete([id]);
  }),
};
