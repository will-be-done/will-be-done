import { deleteRows, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { defaultTask, taskById } from "./tasks";
import {
  canDropModel,
  getDropModelData,
  shouldMoveOutOfStash,
} from "./dropRules";
import { appTypeSlicesMap } from "./maps";
import {
  AnyModel,
  possibleModelType,
  stashEntriesTable,
  taskType,
  isStashEntry,
} from "./tables";

export const appById = selector({
  name: "appById",
  args: {
    id: v.string(),
    modelType: possibleModelType,
  },
  handler: function* appById({ id, modelType }) {
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);
    return (yield* slice.byId(id)) as AnyModel | undefined;
  },
});

export const appByIdOrDefault = selector({
  name: "appByIdOrDefault",
  args: {
    id: v.string(),
    modelType: possibleModelType,
  },
  handler: function* appByIdOrDefault({ id, modelType }) {
    const entity = yield* appById({
      id,
      modelType,
    });
    if (!entity) {
      return defaultTask as AnyModel;
    }

    return entity;
  },
});

const appDropModelData = selector({
  name: "appDropModelData",
  args: { id: v.string(), modelType: possibleModelType },
  handler: function* ({ id, modelType }) {
    if (modelType === "stash") {
      return { modelId: id, modelType };
    }
    const model = yield* appById({ id, modelType });
    if (!model) return undefined;
    const task =
      model.type === "dailyEntry" || model.type === "stashEntry"
        ? yield* taskById({ id: model.taskId })
        : undefined;
    return getDropModelData(model, task);
  },
});

export const appCanDrop = selector({
  name: "appCanDrop",
  skipTrace: true,
  args: {
    id: v.string(),
    modelType: possibleModelType,
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* appCanDrop({ id, modelType, dropId, dropModelType }) {
    const target = yield* appDropModelData({ id, modelType });
    const source = yield* appDropModelData({
      id: dropId,
      modelType: dropModelType,
    });
    return !!source && !!target && canDropModel(source, target);
  },
});

export const appHandleDrop = action({
  name: "appHandleDrop",
  args: {
    id: v.string(),
    modelType: possibleModelType,
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* appHandleDrop({
    id,
    modelType,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    // Validate current rows before moving anything or removing a stash entry.
    if (!(yield* appCanDrop({ id, modelType, dropId, dropModelType }))) return;

    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);

    const model = yield* appById({
      id,
      modelType,
    });
    const targetModelType = model?.type ?? modelType;
    const shouldDeleteStashEntry = shouldMoveOutOfStash(
      targetModelType,
      dropModelType,
    );
    const effectiveDropModelType = shouldDeleteStashEntry
      ? taskType
      : dropModelType;
    const droppedModel = shouldDeleteStashEntry
      ? yield* appById({ id: dropId, modelType: dropModelType })
      : undefined;
    const effectiveDropId = isStashEntry(droppedModel)
      ? droppedModel.taskId
      : dropId;

    if (!model) {
      // For virtual models (e.g. stash) that have no DB row, use modelType directly
      yield* slice.handleDrop(
        id,
        effectiveDropId,
        effectiveDropModelType,
        edge,
      );
      if (shouldDeleteStashEntry) {
        yield* deleteRows(stashEntriesTable, [dropId]);
      }
      return;
    }

    const modelSlice = appTypeSlicesMap[model.type];
    if (!modelSlice) throw new Error(`Unknown model type: ${model.type}`);

    yield* modelSlice.handleDrop(
      id,
      effectiveDropId,
      effectiveDropModelType,
      edge,
    );
    if (shouldDeleteStashEntry) {
      yield* deleteRows(stashEntriesTable, [dropId]);
    }
  },
});

export const appDeleteModel = action({
  name: "appDeleteModel",
  args: {
    id: v.string(),
    modelType: possibleModelType,
  },
  handler: function* appDeleteModel({
    id,
    modelType,
  }): Generator<unknown, void, unknown> {
    const model = yield* appById({
      id,
      modelType,
    });
    if (!model) return;

    const slice = appTypeSlicesMap[model.type];
    if (!slice) throw new Error(`Unknown model type: ${model.type}`);

    yield* slice.delete([id]);
  },
});
