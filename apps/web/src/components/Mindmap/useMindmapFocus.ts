import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  type MindmapNode,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { type FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import type { Size } from "./mindmapLayout.ts";
import { type CanvasIndex, useMindmapSelection } from "./mindmapModel.ts";
import { mindmapNodeFocusKey } from "./focusKeys.ts";

type Pending = { key: FocusKey; focus: boolean; center?: boolean };

// Focusing and revealing nodes, including ones an action has yet to render.
export function useMindmapFocus({
  viewportRef,
  index,
  sizes,
  focusItemId,
  onItemFocused,
  center,
  reveal,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  index: CanvasIndex;
  sizes: ReadonlyMap<string, Size>;
  focusItemId: string | undefined;
  onItemFocused: () => void;
  center: (element: HTMLElement) => void;
  reveal: (element: HTMLElement) => void;
}) {
  const dispatch = useAsyncDispatch();
  const pendingRef = useRef<Pending | null>(null);

  // A node created or moved by an action renders after the dispatch resolves,
  // so focusing it may have to wait for the next commit.
  const settle = useCallback(
    (pending: Pending) => {
      const element = viewportRef.current?.querySelector<HTMLElement>(
        `[data-focusable-key="${pending.key}"]`,
      );
      if (!element) {
        pendingRef.current = pending;
        return;
      }
      pendingRef.current = null;
      if (pending.focus) element.focus({ preventScroll: true });
      if (pending.center) center(element);
      else reveal(element);
    },
    [center, reveal, viewportRef],
  );

  useLayoutEffect(() => {
    if (pendingRef.current) settle(pendingRef.current);
  });

  // Opened from an item's details: expand down to its node, then center it
  // once measured, so the measured layout cannot shift it off-center.
  const focusedItemRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!focusItemId) {
      focusedItemRef.current = undefined;
      return;
    }
    if (focusedItemRef.current === focusItemId) return;
    const entry = [...index.nodes.values()].find(
      (e) =>
        e.id === focusItemId ||
        (e.kind === "node" &&
          (e.tree.task?.id === focusItemId || e.tree.note?.id === focusItemId)),
    );
    if (!entry) return;
    let collapsed = false;
    const parentOf = (id: string | null) =>
      id === null ? undefined : index.nodes.get(id);
    for (
      let parent = entry.kind === "node" ? parentOf(entry.parentId) : undefined;
      parent?.kind === "node";
      parent = parentOf(parent.parentId)
    ) {
      if (!parent.tree.node.collapsed) continue;
      collapsed = true;
      void dispatch(
        updateMindmapNode({ id: parent.id, node: { collapsed: false } }),
      );
    }
    if (collapsed || !sizes.has(entry.id)) return;
    focusedItemRef.current = focusItemId;
    useMindmapSelection.getState().clear();
    useFocusStore.getState().focusByKey(entry.focusKey, true);
    settle({ key: entry.focusKey, focus: true, center: true });
    onItemFocused();
  }, [dispatch, focusItemId, index, onItemFocused, settle, sizes]);

  const focusNode = useCallback(
    (key: FocusKey, keepSelection = false) => {
      if (!keepSelection) useMindmapSelection.getState().clear();
      useFocusStore.getState().focusByKey(key, true);
      settle({ key, focus: true });
    },
    [settle],
  );

  const editNode = useCallback((node: MindmapNode) => {
    const key = mindmapNodeFocusKey(node);
    useFocusStore.getState().editByKey(key);
    pendingRef.current = { key, focus: false };
  }, []);

  return { focusNode, editNode };
}
