import { deleteRows, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { defaultTask } from "./tasks";
import { appTypeSlicesMap } from "./maps";
import {
  AnyModel,
  possibleModelType,
  stashEntriesTable,
  stashEntryType,
  taskType,
  isStashEntry,
} from "./tables";

const shouldMoveOutOfStash = (targetModelType: string, dropModelType: string) =>
  dropModelType === stashEntryType &&
  targetModelType !== stashEntryType &&
  targetModelType !== "stash";

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
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);

    const model = yield* appById({
      id,
      modelType,
    });
    const targetModelType = model?.type ?? modelType;
    const effectiveDropModelType = shouldMoveOutOfStash(
      targetModelType,
      dropModelType,
    )
      ? taskType
      : dropModelType;
    const droppedModel =
      effectiveDropModelType === taskType && dropModelType === stashEntryType
        ? yield* appById({ id: dropId, modelType: dropModelType })
        : undefined;
    const effectiveDropId = isStashEntry(droppedModel)
      ? droppedModel.taskId
      : dropId;

    if (!model) {
      // For virtual models (e.g. stash) that have no DB row, use modelType directly
      return yield* slice.canDrop(id, effectiveDropId, effectiveDropModelType);
    }

    const modelSlice = appTypeSlicesMap[model.type];
    if (!modelSlice) throw new Error(`Unknown model type: ${model.type}`);

    return yield* modelSlice.canDrop(
      id,
      effectiveDropId,
      effectiveDropModelType,
    );
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
