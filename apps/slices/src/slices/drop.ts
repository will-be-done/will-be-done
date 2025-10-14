import { shouldNeverHappen } from "@/utils";
import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { appSlice2 } from "./app";
import { taskType, tasksSlice2 } from "./tasks";
import { projectionType, projectionsSlice2 } from "./projections";
import { dailyListType, dailyListsSlice2 } from "./dailyLists";
import { projectType, projectsSlice2 } from "./projects";

// Slice
export const dropSlice2 = {
  // selectors
  canDrop: selector(function* (
    id: string,
    targetId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(id);
    if (!model) return false;

    // Dispatch to appropriate slice based on model type
    switch (model.type) {
      case taskType:
        return yield* tasksSlice2.canDrop(id, targetId);
      case projectionType:
        return yield* projectionsSlice2.canDrop(id, targetId);
      case dailyListType:
        return yield* dailyListsSlice2.canDrop(id, targetId);
      case projectType:
        return yield* projectsSlice2.canDrop(id, targetId);
      default:
        return false;
    }
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const model = yield* appSlice2.byId(id);
    if (!model) return;

    // Dispatch to appropriate slice based on model type
    switch (model.type) {
      case taskType:
        yield* tasksSlice2.handleDrop(id, dropId, edge);
        break;
      case projectionType:
        yield* projectionsSlice2.handleDrop(id, dropId, edge);
        break;
      case dailyListType:
        yield* dailyListsSlice2.handleDrop(id, dropId, edge);
        break;
      case projectType:
        yield* projectsSlice2.handleDrop(id, dropId, edge);
        break;
      default:
        shouldNeverHappen("Unknown drop type: " + model.type);
    }
  }),
};
