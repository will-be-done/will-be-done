import { action, selector } from "@will-be-done/hyperdb";
import { defaultTask } from "./cardsTasks";
import { AnyModel, AnyModelType, appTypeSlicesMap } from "./maps";

// Selectors and actions
export const byId = selector(function* (id: string, modelType: AnyModelType) {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);
  return (yield* slice.byId(id)) as AnyModel | undefined;
});

export const byIdOrDefault = selector(function* (
  id: string,
  modelType: AnyModelType,
) {
  const entity = yield* byId(id, modelType);
  if (!entity) {
    return defaultTask as AnyModel;
  }

  return entity;
});

export const canDrop = selector(function* (
  id: string,
  modelType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
) {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);

  const model = yield* byId(id, modelType);
  if (!model) {
    // For virtual models (e.g. stash) that have no DB row, use modelType directly
    return yield* slice.canDrop(id, dropId, dropModelType);
  }

  const modelSlice = appTypeSlicesMap[model.type];
  if (!modelSlice) throw new Error(`Unknown model type: ${model.type}`);

  return yield* modelSlice.canDrop(id, dropId, dropModelType);
});

export const handleDrop = action(function* (
  id: string,
  modelType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);

  const model = yield* byId(id, modelType);
  if (!model) {
    // For virtual models (e.g. stash) that have no DB row, use modelType directly
    yield* slice.handleDrop(id, dropId, dropModelType, edge);
    return;
  }

  const modelSlice = appTypeSlicesMap[model.type];
  if (!modelSlice) throw new Error(`Unknown model type: ${model.type}`);

  yield* modelSlice.handleDrop(id, dropId, dropModelType, edge);
});

export const deleteModel = action(function* (
  id: string,
  modelType: AnyModelType,
): Generator<unknown, void, unknown> {
  const model = yield* byId(id, modelType);
  if (!model) return;

  const slice = appTypeSlicesMap[model.type];
  if (!slice) throw new Error(`Unknown model type: ${model.type}`);

  yield* slice.delete([id]);
});
