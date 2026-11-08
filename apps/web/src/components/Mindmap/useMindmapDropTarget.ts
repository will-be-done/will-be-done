import { type RefObject, useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  type ElementDragPayload,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DragLocationHistory } from "@atlaskit/pragmatic-drag-and-drop/types";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  createMindmapNode,
  isNote,
  isTask,
  itemsOfListItems,
  type ListItemType,
  moveMindmapNodes,
  placeMindmapItems,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { type FocusKey, parseColumnKey } from "@/store/focusSlice.ts";
import {
  type DraggedItems,
  type DropPreview,
  dropIntentAt,
  isFloatingRoot,
  placementOfIntent,
  subtreeIds,
  useMindmapDrop,
  useMindmapSelection,
} from "./mindmapModel.ts";
import { mindmapDragSource } from "./mindmapDnd.ts";
import { mindmapNodeFocusKey } from "./focusKeys.ts";
import type { LatestMindmap } from "./useMindmapActions.ts";
import type { View } from "./useMindmapView.ts";

// The viewport is the only drop target; the drop is picked on the layout
// without the preview, so the preview cannot move its own target.
export function useMindmapDropTarget({
  mindmapId,
  viewportRef,
  viewRef,
  latestRef,
  focusNode,
}: {
  mindmapId: string;
  viewportRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<View>;
  latestRef: RefObject<LatestMindmap>;
  focusNode: (key: FocusKey, keepSelection?: boolean) => void;
}) {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const { setPreview } = useMindmapDrop.getState();

    // An item already on the map moves its node; a node under another
    // dragged node travels with it.
    const draggedOf = (data: unknown): DraggedItems | null => {
      const source = mindmapDragSource(data, mindmapId);
      if (!source) return null;
      const { index } = latestRef.current;
      const nodes = [...index.nodes.values()];
      // An item gets a new node even when it is on the map already.
      if (source.kind === "item") return source;
      const picked = new Set(source.nodeIds);
      const hasPickedAncestor = (parentId: string | null): boolean => {
        const parent =
          parentId === null ? undefined : index.nodes.get(parentId);
        return (
          parent?.kind === "node" &&
          (picked.has(parent.id) || hasPickedAncestor(parent.parentId))
        );
      };
      const ids = nodes
        .filter(
          (entry) =>
            entry.kind === "node" &&
            picked.has(entry.id) &&
            !hasPickedAncestor(entry.parentId),
        )
        .map((entry) => entry.id);
      return ids.length > 0 ? { kind: "nodes", ids } : null;
    };

    const previewAt = (
      source: ElementDragPayload,
      location: DragLocationHistory,
    ): DropPreview | null => {
      const dragged = draggedOf(source.data);
      if (!dragged) return null;
      const { index, baseLayout } = latestRef.current;
      const excluded = new Set<string>();
      if (dragged.kind === "nodes") {
        for (const id of dragged.ids) {
          const entry = index.nodes.get(id);
          if (entry?.kind === "node") subtreeIds(entry.tree, excluded);
        }
      }
      const point = mapPointOf(location.current.input);
      const intent = dropIntentAt(baseLayout, point, {
        roots: index.roots,
        excluded,
        float: floatingDragOf(dragged) !== undefined,
      });
      if (!intent) return null;
      // A new main branch goes to the side of its root the pointer is on.
      const root = baseLayout.nodes.get(
        intent.kind === "child" && index.roots.has(intent.nodeId)
          ? intent.nodeId
          : mindmapId,
      );
      const centerX = root ? root.x + root.width / 2 : 0;
      return { intent, dragged, side: point.x < centerX ? "left" : "right" };
    };

    // The floating root being dragged alone; it moves by the pointer's travel.
    const floatingDragOf = (dragged: DraggedItems) => {
      if (dragged.kind !== "nodes" || dragged.ids.length !== 1) return;
      const id = dragged.ids[0]!;
      const entry = latestRef.current.index.nodes.get(id);
      return isFloatingRoot(entry) && entry?.kind === "node"
        ? entry.tree.node
        : undefined;
    };

    const mapPointOf = (input: { clientX: number; clientY: number }) => {
      const rect = element.getBoundingClientRect();
      const view = viewRef.current;
      return {
        x: (input.clientX - rect.left - view.x) / view.zoom,
        y: (input.clientY - rect.top - view.y) / view.zoom,
      };
    };

    return combine(
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          mindmapDragSource(source.data, mindmapId) !== null,
        onDrag: ({ source, location }) =>
          setPreview(previewAt(source, location)),
        onDragLeave: () => setPreview(null),
        onDrop: ({ location }) => {
          const preview = useMindmapDrop.getState().preview;
          setPreview(null);
          if (!preview) return;
          const { intent, dragged } = preview;
          if (intent.kind === "float") {
            const node = floatingDragOf(dragged);
            if (!node) return;
            const start = mapPointOf(location.initial.input);
            const end = mapPointOf(location.current.input);
            void dispatch(
              moveMindmapNodes({
                ids: [node.id],
                placement: {
                  x: (node.x ?? 0) + end.x - start.x,
                  y: (node.y ?? 0) + end.y - start.y,
                },
              }),
            );
            return;
          }
          const placement = placementOfIntent(
            intent,
            latestRef.current.index,
            preview.side,
          );
          const target =
            intent.kind === "child"
              ? latestRef.current.index.nodes.get(intent.nodeId)
              : undefined;
          if (target?.kind === "node" && target.tree.node.collapsed) {
            void dispatch(
              updateMindmapNode({ id: target.id, node: { collapsed: false } }),
            );
          }
          void (async () => {
            if (dragged.kind === "item" && dragged.selectionKeys) {
              const items = await select({
                selector: itemsOfListItems,
                args: {
                  listItems: dragged.selectionKeys.map((key) => {
                    const { id, type } = parseColumnKey(key);
                    return { id, modelType: type as ListItemType };
                  }),
                },
              });
              const placed = await dispatch(
                placeMindmapItems({
                  mindmapId,
                  items: items.flatMap((item) =>
                    isTask(item) || isNote(item)
                      ? [{ type: item.type, id: item.id }]
                      : [],
                  ),
                  placement,
                }),
              );
              const last = placed.at(-1);
              if (last) focusNode(mindmapNodeFocusKey(last));
              if (placed.length > 1) {
                useMindmapSelection
                  .getState()
                  .setIds(
                    new Set(placed.map((node) => node.id)),
                    placed[0]?.id ?? null,
                  );
              }
              return;
            }
            if (dragged.kind === "item") {
              const { type, id } = dragged.item;
              const node = await dispatch(
                createMindmapNode({
                  mindmapId,
                  placement,
                  ...(type === "task" ? { taskId: id } : { noteId: id }),
                }),
              );
              focusNode(mindmapNodeFocusKey(node));
              return;
            }
            const moved = await dispatch(
              moveMindmapNodes({ ids: dragged.ids, placement }),
            );
            if (moved[0]) focusNode(mindmapNodeFocusKey(moved[0]));
            if (moved.length > 1) {
              useMindmapSelection
                .getState()
                .setIds(new Set(moved.map((node) => node.id)));
            }
          })();
        },
      }),
      monitorForElements({ onDrop: () => setPreview(null) }),
    );
  }, [dispatch, focusNode, latestRef, mindmapId, select, viewRef, viewportRef]);
}
