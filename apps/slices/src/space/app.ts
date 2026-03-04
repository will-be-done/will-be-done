import { action, selector } from "@will-be-done/hyperdb";
import { defaultTask } from "./cardsTasks";
import { AnyModel, AnyModelType, appTypeSlicesMap } from "./maps";

// Selectors and actions
const byId = selector(function* (id: string, modelType: AnyModelType) {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);
  return (yield* slice.byId(id)) as AnyModel | undefined;
});

const byIdOrDefault = selector(function* (id: string, modelType: AnyModelType) {
  const entity = yield* byId(id, modelType);
  if (!entity) {
    return defaultTask as AnyModel;
  }

  return entity;
});

const canDrop = selector(function* (
  id: string,
  modelType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
) {
  const model = yield* byId(id, modelType);
  if (!model) return false;

  const slice = appTypeSlicesMap[model.type];
  if (!slice) throw new Error(`Unknown model type: ${model.type}`);

  return yield* slice.canDrop(id, dropId, dropModelType);
});

const handleDrop = action(function* (
  id: string,
  modelType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const model = yield* byId(id, modelType);
  if (!model) return;

  const slice = appTypeSlicesMap[model.type];
  if (!slice) throw new Error(`Unknown model type: ${model.type}`);

  yield* slice.handleDrop(id, dropId, dropModelType, edge);
});

const deleteModel = action(function* (
  id: string,
  modelType: AnyModelType,
): Generator<unknown, void, unknown> {
  const model = yield* byId(id, modelType);
  if (!model) return;

  const slice = appTypeSlicesMap[model.type];
  if (!slice) throw new Error(`Unknown model type: ${model.type}`);

  yield* slice.delete([id]);
});

// Slice
export const appSlice = {
  byId,
  byIdOrDefault,
  canDrop,
  handleDrop,
  delete: deleteModel,
};
