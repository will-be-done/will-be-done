import { type FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import type { MindmapLayout } from "./mindmapLayout.ts";
import {
  type CanvasIndex,
  type Direction,
  useMindmapMenu,
  useMindmapSelection,
} from "./mindmapModel.ts";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";

const isRemoveKey = (code: string) =>
  code === "Backspace" ||
  code === "Delete" ||
  code === "KeyD" ||
  code === "KeyX";

const centerY = (node: { y: number; height: number }) =>
  node.y + node.height / 2;

const treeMoveKeys: Record<string, Direction | undefined> = {
  ArrowLeft: "left",
  KeyH: "left",
  ArrowRight: "right",
  KeyL: "right",
  ArrowUp: "up",
  KeyK: "up",
  ArrowDown: "down",
  KeyJ: "down",
};

// The nearest node that way on screen, by branch side and depth.
function neighborOf(
  layout: MindmapLayout,
  index: CanvasIndex,
  id: string,
  direction: Direction,
) {
  const current = layout.nodes.get(id);
  const entry = index.nodes.get(id);
  if (!current || !entry) return undefined;
  const y = centerY(current);
  const closest = (candidates: { id: string; y: number; height: number }[]) =>
    candidates.reduce<(typeof candidates)[number] | undefined>(
      (best, node) =>
        !best || Math.abs(centerY(node) - y) < Math.abs(centerY(best) - y)
          ? node
          : best,
      undefined,
    )?.id;

  const all = [...layout.nodes.values()];
  if (direction === "left" || direction === "right") {
    const outward = current.side === null || current.side === direction;
    if (!outward) return entry.kind === "node" ? entry.parentId : undefined;
    return closest(
      all.filter(
        (node) =>
          node.parentId === id &&
          (current.side !== null || node.side === direction),
      ),
    );
  }
  if (current.side === null) return undefined;
  return closest(
    all.filter(
      (node) =>
        node.depth === current.depth &&
        node.side === current.side &&
        (direction === "up" ? centerY(node) < y : centerY(node) > y),
    ),
  );
}

export function handleMindmapKeyDown(
  e: React.KeyboardEvent,
  {
    index,
    layout,
    actions,
    focusNode,
  }: {
    index: CanvasIndex;
    layout: MindmapLayout;
    actions: MindmapNodeActions;
    focusNode: (key: FocusKey, keepSelection?: boolean) => void;
  },
) {
  const focus = useFocusStore.getState();
  if (focus.isFocusDisabled || focus.editItemKey || e.defaultPrevented) {
    return;
  }
  // Popovers and dialogs portal out of the viewport but still bubble here.
  if (!(e.target instanceof Node && e.currentTarget.contains(e.target))) {
    return;
  }
  if (e.target instanceof Element && isInputElement(e.target)) return;
  if (e.metaKey || e.altKey) return;

  const selection = useMindmapSelection.getState().ids;
  // Ctrl+X cuts through the clipboard events instead.
  if (
    selection.size > 0 &&
    !e.ctrlKey &&
    (isRemoveKey(e.code) || e.code === "Escape")
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      useMindmapSelection.getState().clear();
    } else {
      actions.removeNodes([...selection]);
    }
    return;
  }

  const id = focus.focusItemKey
    ? index.byFocusKey.get(focus.focusItemKey)
    : undefined;
  if (!id) return;
  const entry = index.nodes.get(id)!;

  if (e.ctrlKey) {
    const direction = treeMoveKeys[e.code];
    if (!direction || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    actions.moveInTree(id, direction);
    return;
  }

  const move = (direction: Direction) => {
    const next = neighborOf(layout, index, id, direction);
    const nextEntry = next ? index.nodes.get(next) : undefined;
    if (nextEntry) focusNode(nextEntry.focusKey);
  };
  // Shift with a direction grows the selection to the next node.
  const extendDirection = e.shiftKey ? treeMoveKeys[e.code] : undefined;
  if (extendDirection) {
    e.preventDefault();
    e.stopPropagation();
    const next = neighborOf(layout, index, id, extendDirection);
    const nextEntry = next ? index.nodes.get(next) : undefined;
    if (!nextEntry) return;
    const selection = useMindmapSelection.getState();
    const ids = new Set(selection.ids);
    for (const picked of [entry, nextEntry]) {
      if (picked.kind === "node") ids.add(picked.id);
    }
    selection.setIds(ids, selection.ids.size > 0 ? selection.anchorId : id);
    focusNode(nextEntry.focusKey, true);
    return;
  }

  const shiftCommands: Record<string, (() => void) | undefined> = {
    KeyO: () => actions.addSibling(id, "before"),
    KeyS: () => actions.stash(id),
  };
  const commands: Record<string, (() => void) | undefined> = {
    ArrowLeft: () => move("left"),
    KeyH: () => move("left"),
    ArrowRight: () => move("right"),
    KeyL: () => move("right"),
    ArrowUp: () => move("up"),
    KeyK: () => move("up"),
    ArrowDown: () => move("down"),
    KeyJ: () => move("down"),
    Tab: () => actions.addChild(id),
    KeyO: () => actions.addSibling(id, "after"),
    Enter: () => actions.addSibling(id, "after"),
    KeyI: () => useFocusStore.getState().editByKey(entry.focusKey),
    Space: () => actions.toggleTask(id),
    Backspace: () => actions.removeNodes([id]),
    Delete: () => actions.removeNodes([id]),
    KeyD: () => actions.removeNodes([id]),
    KeyX: () => actions.removeNodes([id]),
    Period: () => actions.toggleCollapsed(id),
    KeyM: () => actions.moveToProject(id),
    KeyS: () => actions.schedule(id),
    KeyT: () => actions.scheduleToday(id),
    KeyR: () => actions.resetSchedule(id),
    KeyE: () => actions.editDescription(id),
    KeyC: () => actions.addChecklistItem(id),
    KeyA: () => {
      if (entry.kind === "node") {
        useMindmapMenu.getState().setNodeId(id);
      }
    },
    Escape: () => {
      useFocusStore.getState().resetFocus();
      (e.target as HTMLElement).blur();
    },
  };
  const command = (e.shiftKey ? shiftCommands : commands)[e.code];
  if (!command) return;
  e.preventDefault();
  e.stopPropagation();
  command();
}
