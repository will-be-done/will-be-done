import { describe, expect, it } from "vitest";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type {
  DropTargetRecord,
  Input,
} from "@atlaskit/pragmatic-drag-and-drop/types";
import type { ElementDropTargetEventBasePayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  getModelDropTarget,
  getDropIndicatorEdge,
  isActiveDropTarget,
  isModelDNDData,
  type DndModelData,
} from "./models";

const input: Input = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  button: 0,
  buttons: 1,
  clientX: 20,
  clientY: 5,
  pageX: 20,
  pageY: 5,
};
const source: DndModelData = {
  modelId: "source",
  modelType: "dailyEntry",
  task: { id: "source-task", state: "todo" },
};

function target(data: DndModelData): DropTargetRecord {
  const element = {
    getBoundingClientRect: () => ({ top: 0, bottom: 40, left: 0, right: 100 }),
  } as Element;
  return {
    element,
    data: attachClosestEdge(data, {
      element,
      input,
      allowedEdges: ["top", "bottom"],
    }),
    dropEffect: "move",
    isActiveDueToStickiness: false,
  };
}

function event(
  data: DndModelData,
  targets: DropTargetRecord[],
  self: DropTargetRecord,
): ElementDropTargetEventBasePayload {
  return {
    source: { data, element: {} as HTMLElement, dragHandle: null },
    location: {
      initial: { input, dropTargets: [] },
      previous: { dropTargets: [] },
      current: { input, dropTargets: targets },
    },
    self,
  };
}

describe("drop target feedback", () => {
  it("uses the eligible row for both its indicator and drop execution", () => {
    const row = target({
      modelId: "row",
      modelType: "dailyEntry",
      task: { id: "target-task", state: "todo" },
    });
    const column = target({ modelId: "day", modelType: "dailyList" });
    const targets = [row, column];
    expect(getModelDropTarget(source, targets)).toBe(row);
    expect(getDropIndicatorEdge(event(source, targets, row))).toBe("top");
    expect(isActiveDropTarget(event(source, targets, column))).toBe(false);
    expect(getDropIndicatorEdge(event(source, targets, column))).toBeNull();
  });

  it("rejects a completed row and highlights its eligible parent column", () => {
    const row = target({
      modelId: "done",
      modelType: "dailyEntry",
      task: { id: "done-task", state: "done" },
    });
    const column = target({ modelId: "day", modelType: "dailyList" });
    const targets = [row, column];
    expect(getModelDropTarget(source, targets)).toBe(column);
    expect(getDropIndicatorEdge(event(source, targets, row))).toBeNull();
    expect(isActiveDropTarget(event(source, targets, column))).toBe(true);
  });

  it("skips an unsupported checklist row and clears the parent indicator when an eligible child takes over", () => {
    const checklist = target({
      modelId: "checklist",
      modelType: "checklistItem",
    });
    const row = target({
      modelId: "task",
      modelType: "task",
      task: { id: "task", state: "todo" },
    });
    const column = target({ modelId: "section", modelType: "projectSection" });
    const targets = [checklist, row, column];
    expect(getModelDropTarget(source, targets)).toBe(row);
    expect(getDropIndicatorEdge(event(source, targets, checklist))).toBeNull();
    expect(isActiveDropTarget(event(source, targets, column))).toBe(false);

    const checklistSource: DndModelData = {
      modelId: "other-checklist",
      modelType: "checklistItem",
    };
    expect(getModelDropTarget(checklistSource, targets)).toBe(checklist);
    expect(
      getDropIndicatorEdge(event(checklistSource, targets, checklist)),
    ).toBe("top");
    expect(
      getDropIndicatorEdge(event(checklistSource, targets, row)),
    ).toBeNull();
  });

  it("shows no indicator when neither the row nor its parent accepts the source", () => {
    const row = target({
      modelId: "done",
      modelType: "dailyEntry",
      task: { id: "done-task", state: "done" },
    });
    const column = target({ modelId: "day", modelType: "dailyList" });
    const template: DndModelData = {
      modelId: "template",
      modelType: "template",
    };
    expect(getModelDropTarget(template, [row, column])).toBeUndefined();
    expect(
      getDropIndicatorEdge(event(template, [row, column], row)),
    ).toBeNull();
    expect(isActiveDropTarget(event(template, [row, column], column))).toBe(
      false,
    );
  });

  it.each([
    null,
    {},
    { modelId: "id" },
    { modelId: 1, modelType: "project" },
    { modelId: "id", modelType: "unknown" },
    { modelId: "id", modelType: "task" },
    {
      modelId: "id",
      modelType: "dailyEntry",
      task: { id: "task", state: "unknown" },
    },
    { modelId: "id", modelType: "task", task: { id: "other", state: "todo" } },
    { modelId: "id", modelType: "project", role: "unknown" },
  ])("rejects malformed drag data: %j", (data) => {
    expect(isModelDNDData(data)).toBe(false);
    expect(
      getModelDropTarget(data, [
        target({ modelId: "day", modelType: "dailyList" }),
      ]),
    ).toBeUndefined();
  });
});
