import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  type ElementDragPayload,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { DragLocationHistory } from "@atlaskit/pragmatic-drag-and-drop/types";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  appHandleDrop,
  convertMindmapNodeToNote,
  convertNoteToTask,
  convertTaskToNote,
  convertMindmapNodeToTask,
  convertMindmapNodeToTopic,
  createItem as createChecklistItem,
  createMindmapNode,
  createMindmapNote,
  createMindmapTask,
  deleteMindmapNodes,
  getDMY,
  type MindmapNode,
  type MindmapPlacement,
  type MindmapTree,
  moveMindmapNodes,
  moveNoteToProject,
  moveTaskToProject,
  removeFromDailyList,
  scheduleTask,
  STASH_ID,
  stashType,
  taskHasNoteIncompatibleData,
  taskType,
  toggleTaskState,
  trashNotes,
  trashTasks,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { Maximize, Minus, Plus } from "lucide-react";
import { type FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel.tsx";
import { focusChecklistItem } from "@/components/Checklist/focus";
import { captureWebAnalytics } from "@/lib/analytics";
import {
  useItemDetailsEditRequest,
  useItemDetailsOpen,
} from "@/components/ItemDetails/ItemDetailsStore.ts";
import {
  type MindmapLayout,
  type Size,
  layoutMindmap,
} from "./mindmapLayout.ts";
import {
  type CanvasIndex,
  type DraggedItems,
  type Direction,
  type DropPreview,
  type NodeKind,
  branchColor,
  dropIntentAt,
  ghostSourceId,
  indexMindmapTree,
  isGhostId,
  nodeKind,
  placementOfIntent,
  subtreeIds,
  treeMoveOf,
  useMindmapDatePicker,
  useMindmapDrop,
  useMindmapMenu,
  useMindmapSelection,
  withDropGhosts,
} from "./mindmapModel.ts";
import { mindmapDragSource } from "./mindmapDnd.ts";
import { MindmapGhostCard } from "./MindmapGhostCard.tsx";
import { mindmapNodeFocusKey } from "./focusKeys.ts";
import { createNodeSizeStore } from "./nodeSizes.ts";
import {
  MindmapNodeCard,
  type MindmapNodeActions,
} from "./MindmapNodeCard.tsx";

type View = { x: number; y: number; zoom: number };
type Pending = { key: FocusKey; focus: boolean; center?: boolean };

// Survives navigating between maps within a session.
const savedViews = new Map<string, View>();
const estimatedSize: Size = { width: 120, height: 32 };
const minZoom = 0.2;
const maxZoom = 2.5;
const revealPadding = 48;
const noIds: ReadonlySet<string> = new Set();

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

export function MindmapCanvas({
  tree,
  projectId,
  focusItemId,
  onItemFocused,
}: {
  tree: MindmapTree;
  // Where new tasks and notes go: the project shown under the map.
  projectId: string | undefined;
  focusItemId: string | undefined;
  onItemFocused: () => void;
}) {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();
  const mindmapId = tree.mindmap.id;
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>({ x: 0, y: 0, zoom: 1 });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [sizeStore] = useState(createNodeSizeStore);
  const sizes = useSyncExternalStore(
    sizeStore.subscribe,
    sizeStore.getSnapshot,
  );
  const pendingRef = useRef<Pending | null>(null);

  const preview = useMindmapDrop((s) => s.preview);

  const index = useMemo(() => indexMindmapTree(tree), [tree]);
  const sizeOf = useCallback(
    (id: string) =>
      sizes.get(id) ??
      (isGhostId(id) ? sizes.get(ghostSourceId(id)) : undefined) ??
      estimatedSize,
    [sizes],
  );
  // Drops are picked on the map without their own preview.
  const baseLayout = useMemo(
    () => layoutMindmap(mindmapId, tree.branches, sizeOf),
    [mindmapId, tree.branches, sizeOf],
  );
  const layout = useMemo(
    () =>
      preview
        ? layoutMindmap(
            mindmapId,
            withDropGhosts(tree.branches, mindmapId, preview),
            sizeOf,
          )
        : baseLayout,
    [baseLayout, mindmapId, preview, sizeOf, tree.branches],
  );
  const movingIds = useMemo(() => {
    if (preview?.dragged.kind !== "nodes") return noIds;
    const ids = new Set<string>();
    for (const id of preview.dragged.ids) {
      const entry = index.nodes.get(id);
      if (entry?.kind === "node") subtreeIds(entry.tree, ids);
    }
    return ids;
  }, [index, preview]);
  // Handlers registered once read the current tree through this ref.
  const latestRef = useRef({ index, baseLayout });
  useLayoutEffect(() => {
    latestRef.current = { index, baseLayout };
  });

  const applyView = useCallback(
    (view: View) => {
      viewRef.current = view;
      savedViews.set(mindmapId, view);
      if (worldRef.current) {
        worldRef.current.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
      }
      setZoomPercent(Math.round(view.zoom * 100));
    },
    [mindmapId],
  );

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => {
      const view = viewRef.current;
      const zoom = Math.min(maxZoom, Math.max(minZoom, view.zoom * factor));
      applyView({
        zoom,
        x: x - ((x - view.x) / view.zoom) * zoom,
        y: y - ((y - view.y) / view.zoom) * zoom,
      });
    },
    [applyView],
  );

  const zoomFromCenter = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) zoomAt(rect.width / 2, rect.height / 2, factor);
  };

  const fit = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nodes = [...layout.nodes.values()];
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.width));
    const maxY = Math.max(...nodes.map((n) => n.y + n.height));
    const zoom = Math.min(
      1,
      Math.max(
        minZoom,
        Math.min(
          (rect.width - revealPadding * 2) / (maxX - minX),
          (rect.height - revealPadding * 2) / (maxY - minY),
        ),
      ),
    );
    applyView({
      zoom,
      x: rect.width / 2 - ((minX + maxX) / 2) * zoom,
      y: rect.height / 2 - ((minY + maxY) / 2) * zoom,
    });
  };

  useLayoutEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    applyView(
      savedViews.get(mindmapId) ?? {
        x: (rect?.width ?? 0) / 2,
        y: (rect?.height ?? 0) / 2,
        zoom: 1,
      },
    );
  }, [applyView, mindmapId]);

  const reveal = useCallback(
    (element: HTMLElement) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const rect = element.getBoundingClientRect();
      const shift = (start: number, end: number, min: number, max: number) =>
        start < min + revealPadding
          ? min + revealPadding - start
          : end > max - revealPadding
            ? Math.max(min + revealPadding - start, max - revealPadding - end)
            : 0;
      const dx = shift(rect.left, rect.right, viewport.left, viewport.right);
      const dy = shift(rect.top, rect.bottom, viewport.top, viewport.bottom);
      if (dx || dy) {
        const view = viewRef.current;
        applyView({ ...view, x: view.x + dx, y: view.y + dy });
      }
    },
    [applyView],
  );

  const center = useCallback(
    (element: HTMLElement) => {
      const viewport = viewportRef.current?.getBoundingClientRect();
      if (!viewport) return;
      const rect = element.getBoundingClientRect();
      const view = viewRef.current;
      applyView({
        ...view,
        x:
          view.x +
          viewport.left +
          viewport.width / 2 -
          (rect.left + rect.width / 2),
        y:
          view.y +
          viewport.top +
          viewport.height / 2 -
          (rect.top + rect.height / 2),
      });
    },
    [applyView],
  );

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
    [center, reveal],
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
        e.kind === "node" &&
        (e.tree.task?.id === focusItemId || e.tree.note?.id === focusItemId),
    );
    if (entry?.kind !== "node") return;
    let collapsed = false;
    for (
      let parent = index.nodes.get(entry.parentId);
      parent?.kind === "node";
      parent = index.nodes.get(parent.parentId)
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

  useEffect(() => sizeStore.disconnect, [sizeStore]);

  useEffect(
    () => () => {
      useMindmapSelection.getState().clear();
      useMindmapDrop.getState().setPreview(null);
    },
    [],
  );

  const focusNode = useCallback(
    (key: FocusKey) => {
      useMindmapSelection.getState().clear();
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

  // The node whose item is being moved to another project.
  const [movingItemNodeId, setMovingItemNodeId] = useState<string | null>(null);

  const actions: MindmapNodeActions = useMemo(() => {
    const entryOf = (id: string) => latestRef.current.index.nodes.get(id);
    const parentKeyOf = (id: string) => {
      const entry = entryOf(id);
      return entry?.kind === "node"
        ? entryOf(entry.parentId)?.focusKey
        : undefined;
    };
    // New nodes match the node they are created from: tasks beget tasks.
    const create = async (placement: MindmapPlacement, kind: NodeKind) =>
      editNode(
        await dispatch(
          kind === "task"
            ? createMindmapTask({ mindmapId, placement, projectId })
            : kind === "note"
              ? createMindmapNote({ mindmapId, placement, projectId })
              : createMindmapNode({ mindmapId, placement }),
        ),
      );
    const taskOf = (id: string) => {
      const entry = entryOf(id);
      return entry?.kind === "node" ? entry.tree.task : undefined;
    };
    const itemOf = (id: string) => {
      const entry = entryOf(id);
      return entry?.kind === "node"
        ? (entry.tree.task ?? entry.tree.note)
        : undefined;
    };
    const kindOf = (id: string): NodeKind => {
      const entry = entryOf(id);
      return entry?.kind === "node" ? nodeKind(entry.tree) : "topic";
    };
    // Focus moves to the nearest ancestor that survives the removal.
    const removeNodes = (ids: string[]) => {
      const removed = new Set<string>();
      for (const id of ids) {
        const entry = entryOf(id);
        if (entry?.kind === "node") subtreeIds(entry.tree, removed);
      }
      if (removed.size === 0) return;
      let survivor = ids[0] === undefined ? undefined : entryOf(ids[0]);
      while (survivor?.kind === "node" && removed.has(survivor.id)) {
        survivor = entryOf(survivor.parentId);
      }
      void dispatch(deleteMindmapNodes({ ids: [...removed] }));
      if (survivor) focusNode(survivor.focusKey);
      else useMindmapSelection.getState().clear();
    };

    return {
      register: sizeStore.register,
      addChild: (id) => {
        const entry = entryOf(id);
        if (entry?.kind === "node" && entry.tree.node.collapsed) {
          void dispatch(updateMindmapNode({ id, node: { collapsed: false } }));
        }
        void create(
          {
            parentId: entry?.kind === "node" ? id : mindmapId,
            position: "last",
          },
          kindOf(id),
        );
      },
      addSibling: (id, edge) => {
        if (entryOf(id)?.kind !== "node") {
          void create({ parentId: mindmapId, position: "last" }, "topic");
          return;
        }
        void create({ siblingId: id, edge }, kindOf(id));
      },
      removeNodes,
      remove: (id) => {
        const selection = useMindmapSelection.getState().ids;
        removeNodes(selection.has(id) ? [...selection] : [id]);
      },
      toggleSelected: (id) => {
        if (entryOf(id)?.kind !== "node") return;
        // The node focused before a modifier click joins the selection.
        const selection = useMindmapSelection.getState();
        const next = new Set(selection.ids);
        const focusKey = useFocusStore.getState().focusItemKey;
        const focusedId = focusKey
          ? latestRef.current.index.byFocusKey.get(focusKey)
          : undefined;
        if (
          next.size === 0 &&
          focusedId !== undefined &&
          entryOf(focusedId)?.kind === "node"
        ) {
          next.add(focusedId);
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selection.setIds(next);
      },
      discardIfEmpty: (id, refocus) => {
        const entry = entryOf(id);
        if (entry?.kind !== "node" || entry.tree.children.length > 0) return;
        const parentKey = parentKeyOf(id);
        void dispatch(deleteMindmapNodes({ ids: [id] }));
        if (refocus && parentKey) focusNode(parentKey);
      },
      convert: (id, to) => {
        if (entryOf(id)?.kind !== "node") return;
        void (async () => {
          if (to === "topic") {
            focusNode(
              mindmapNodeFocusKey(
                await dispatch(convertMindmapNodeToTopic({ id })),
              ),
            );
          } else if (to === "task") {
            const task = await dispatch(
              convertMindmapNodeToTask({ id, projectId }),
            );
            focusNode(mindmapNodeFocusKey({ id, taskId: task.id }));
          } else {
            const note = await dispatch(
              convertMindmapNodeToNote({ id, projectId }),
            );
            focusNode(
              mindmapNodeFocusKey({ id, taskId: null, noteId: note.id }),
            );
          }
        })();
      },
      toggleCollapsed: (id) => {
        const entry = entryOf(id);
        if (entry?.kind !== "node") return;
        void dispatch(
          updateMindmapNode({
            id,
            node: { collapsed: !entry.tree.node.collapsed },
          }),
        );
      },
      toggleTask: (id) => {
        const task = taskOf(id);
        if (task) void dispatch(toggleTaskState({ taskId: task.id }));
      },
      moveInTree: (id, direction) => {
        const move = treeMoveOf(latestRef.current.index, id, direction);
        if (!move) return;
        const parent = move.newParentId && entryOf(move.newParentId);
        if (parent && parent.kind === "node" && parent.tree.node.collapsed) {
          void dispatch(
            updateMindmapNode({ id: parent.id, node: { collapsed: false } }),
          );
        }
        void dispatch(
          moveMindmapNodes({ ids: [id], placement: move.placement }),
        );
      },
      moveToProject: (id) => {
        if (itemOf(id)) setMovingItemNodeId(id);
      },
      schedule: (id) => {
        if (taskOf(id)) useMindmapDatePicker.getState().setNodeId(id);
      },
      scheduleToday: (id) => {
        const task = taskOf(id);
        if (!task) return;
        void dispatch(
          scheduleTask({
            taskId: task.id,
            date: getDMY(new Date()),
            position: "append",
          }),
        );
      },
      resetSchedule: (id) => {
        const task = taskOf(id);
        if (task) void dispatch(removeFromDailyList({ taskId: task.id }));
      },
      stash: (id) => {
        const task = taskOf(id);
        if (task?.state !== "todo") return;
        void dispatch(
          appHandleDrop({
            id: STASH_ID,
            modelType: stashType,
            dropId: task.id,
            dropModelType: taskType,
            edge: "top",
          }),
        );
      },
      addChecklistItem: (id) => {
        const entry = entryOf(id);
        const task = taskOf(id);
        if (!entry || !task) return;
        focusNode(entry.focusKey);
        void (async () => {
          const item = await dispatch(
            createChecklistItem({
              item: { parentId: task.id, parentType: task.type },
            }),
          );
          captureWebAnalytics({
            name: "checklist_item_created",
            properties: { creation_method: "web" },
          });
          focusChecklistItem(item.id, {
            root: document.querySelector(
              `[data-mindmap-node="${CSS.escape(id)}"]`,
            ),
          });
        })();
      },
      editDescription: (id) => {
        const item = itemOf(id);
        if (!item) return;
        useItemDetailsOpen.getState().setOpen(true);
        useItemDetailsEditRequest.getState().editDescription(item.id);
      },
      convertItem: (id) => {
        const entry = entryOf(id);
        if (entry?.kind !== "node") return;
        const { task, note } = entry.tree;
        void (async () => {
          if (task) {
            const losesData = await select({
              selector: taskHasNoteIncompatibleData,
              args: { taskId: task.id },
            });
            if (
              losesData &&
              !window.confirm(
                "Convert to note? Its schedule, stash entry and checklist will be removed.",
              )
            ) {
              return;
            }
            const created = await dispatch(
              convertTaskToNote({ taskId: task.id }),
            );
            focusNode(
              mindmapNodeFocusKey({ id, taskId: null, noteId: created.id }),
            );
          } else if (note) {
            const created = await dispatch(
              convertNoteToTask({ noteId: note.id }),
            );
            focusNode(mindmapNodeFocusKey({ id, taskId: created.id }));
          }
        })();
      },
      trashItem: (id) => {
        const entry = entryOf(id);
        if (entry?.kind !== "node") return;
        const { task, note } = entry.tree;
        const parentKey = parentKeyOf(id);
        if (task) void dispatch(trashTasks({ ids: [task.id] }));
        else if (note) void dispatch(trashNotes({ ids: [note.id] }));
        else return;
        if (parentKey) focusNode(parentKey);
      },
    };
  }, [dispatch, editNode, focusNode, mindmapId, projectId, select, sizeStore]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(
          e.clientX - rect.left,
          e.clientY - rect.top,
          Math.exp(-e.deltaY * 0.01),
        );
        return;
      }
      const view = viewRef.current;
      // A mouse wheel with Shift scrolls sideways.
      const [dx, dy] =
        e.shiftKey && e.deltaX === 0 ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
      applyView({ ...view, x: view.x - dx, y: view.y - dy });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [applyView, zoomAt]);

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
      if (source.kind === "item") {
        const existing = nodes.find(
          (entry) =>
            entry.kind === "node" &&
            (entry.tree.node.taskId ?? entry.tree.node.noteId) ===
              source.item.id,
        );
        return existing ? { kind: "nodes", ids: [existing.id] } : source;
      }
      const picked = new Set(source.nodeIds);
      const hasPickedAncestor = (parentId: string): boolean => {
        const parent = index.nodes.get(parentId);
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
      const rect = element.getBoundingClientRect();
      const view = viewRef.current;
      const { clientX, clientY } = location.current.input;
      const point = {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
      const intent = dropIntentAt(baseLayout, point, {
        rootId: mindmapId,
        excluded,
      });
      return intent
        ? { intent, dragged, side: point.x < 0 ? "left" : "right" }
        : null;
    };

    return combine(
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          mindmapDragSource(source.data, mindmapId) !== null,
        onDrag: ({ source, location }) =>
          setPreview(previewAt(source, location)),
        onDragLeave: () => setPreview(null),
        onDrop: () => {
          const preview = useMindmapDrop.getState().preview;
          setPreview(null);
          if (!preview) return;
          const { intent, dragged } = preview;
          const placement = placementOfIntent(intent, mindmapId, preview.side);
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
  }, [dispatch, focusNode, mindmapId]);

  const marqueeRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<
    | { kind: "pan"; pointerId: number; x: number; y: number }
    | {
        kind: "marquee";
        pointerId: number;
        x: number;
        y: number;
        moved: boolean;
        base: ReadonlySet<string>;
      }
    | null
  >(null);

  // Dragging empty space selects with a rectangle; the middle button pans.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
      return;
    }
    if (
      e.button !== 0 ||
      (e.target instanceof Element &&
        e.target.closest("[data-mindmap-node], button"))
    ) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    gestureRef.current = {
      kind: "marquee",
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      base: additive ? useMindmapSelection.getState().ids : noIds,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    if (gesture.kind === "pan") {
      const view = viewRef.current;
      applyView({
        ...view,
        x: view.x + e.clientX - gesture.x,
        y: view.y + e.clientY - gesture.y,
      });
      gesture.x = e.clientX;
      gesture.y = e.clientY;
      return;
    }

    const rect = viewportRef.current?.getBoundingClientRect();
    const marquee = marqueeRef.current;
    if (!rect || !marquee) return;
    if (
      !gesture.moved &&
      Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 3
    ) {
      return;
    }
    gesture.moved = true;
    const left = Math.min(gesture.x, e.clientX) - rect.left;
    const top = Math.min(gesture.y, e.clientY) - rect.top;
    const width = Math.abs(e.clientX - gesture.x);
    const height = Math.abs(e.clientY - gesture.y);
    Object.assign(marquee.style, {
      display: "block",
      transform: `translate(${left}px, ${top}px)`,
      width: `${width}px`,
      height: `${height}px`,
    });

    const view = viewRef.current;
    const x1 = (left - view.x) / view.zoom;
    const y1 = (top - view.y) / view.zoom;
    const x2 = x1 + width / view.zoom;
    const y2 = y1 + height / view.zoom;
    const ids = new Set(gesture.base);
    for (const node of layout.nodes.values()) {
      if (
        index.nodes.get(node.id)?.kind === "node" &&
        node.x < x2 &&
        node.x + node.width > x1 &&
        node.y < y2 &&
        node.y + node.height > y1
      ) {
        ids.add(node.id);
      }
    }
    useMindmapSelection.getState().setIds(ids);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (gesture.kind !== "marquee") return;
    if (marqueeRef.current) marqueeRef.current.style.display = "none";
    useFocusStore.getState().resetFocus();
    if (gesture.moved) {
      // Keys reach the canvas handler only from inside the viewport.
      viewportRef.current?.focus({ preventScroll: true });
      return;
    }
    useMindmapSelection.getState().clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const movingEntry = movingItemNodeId
    ? index.nodes.get(movingItemNodeId)
    : undefined;
  const movingItem =
    movingEntry?.kind === "node"
      ? (movingEntry.tree.task ?? movingEntry.tree.note)
      : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    if (selection.size > 0 && (isRemoveKey(e.code) || e.code === "Escape")) {
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
  };

  return (
    <div
      ref={viewportRef}
      tabIndex={-1}
      className="relative min-h-0 flex-1 overflow-hidden outline-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      // Middle-button autoscroll would fight panning.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      // Focusing a node can scroll this clipped box; panning owns position.
      onScroll={(e) => {
        e.currentTarget.scrollTop = 0;
        e.currentTarget.scrollLeft = 0;
      }}
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left">
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={1}
          height={1}
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke={branchColor(edge.branch)}
              strokeOpacity={movingIds.has(edge.id) ? 0.25 : 0.75}
              strokeDasharray={isGhostId(edge.id) ? "4 4" : undefined}
              strokeWidth={edge.depth === 1 ? 3 : edge.depth === 2 ? 2 : 1.5}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {[...layout.nodes.values()].map((laidOut) => {
          if (isGhostId(laidOut.id)) {
            const sourceEntry = index.nodes.get(ghostSourceId(laidOut.id));
            const source = sourceEntry
              ? ({ kind: "node", entry: sourceEntry } as const)
              : preview?.dragged.kind === "item"
                ? ({ kind: "item", item: preview.dragged.item } as const)
                : undefined;
            return (
              source && (
                <MindmapGhostCard
                  key={laidOut.id}
                  layout={laidOut}
                  source={source}
                  register={sizeStore.register}
                />
              )
            );
          }
          const entry = index.nodes.get(laidOut.id);
          return (
            entry && (
              <MindmapNodeCard
                key={laidOut.id}
                mindmapId={mindmapId}
                entry={entry}
                layout={laidOut}
                actions={actions}
                isMoving={movingIds.has(laidOut.id)}
                startEditing={
                  entry.kind === "root" &&
                  tree.branches.length === 0 &&
                  !tree.root.title.trim()
                }
              />
            )
          );
        })}
      </div>

      {movingEntry?.kind === "node" && movingItem && (
        <MoveModal
          keepsFocus
          exceptProjectId={movingEntry.tree.project?.id ?? ""}
          setIsOpen={(open) => {
            if (open) return;
            setMovingItemNodeId(null);
            focusNode(movingEntry.focusKey);
          }}
          handleMove={(projectId) =>
            void dispatch(
              movingEntry.tree.task
                ? moveTaskToProject({ taskId: movingItem.id, projectId })
                : moveNoteToProject({ noteId: movingItem.id, projectId }),
            )
          }
        />
      )}

      <div
        ref={marqueeRef}
        className="pointer-events-none absolute left-0 top-0 hidden rounded-sm border border-accent/70 bg-accent/10"
      />

      {tree.branches.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-content-tinted/60">
          Select the central topic and press Tab to add a topic, or drag tasks
          and notes here from the projects below.
        </p>
      )}

      <div
        className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-lg bg-task-dropdown p-0.5 text-content-tinted ring-1 ring-white/10"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Zoom out"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-white/10 hover:text-content"
          onClick={() => zoomFromCenter(1 / 1.2)}
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          className="h-7 w-12 cursor-pointer rounded-md text-[11px] tabular-nums hover:bg-white/10 hover:text-content"
          onClick={() => zoomFromCenter(1 / viewRef.current.zoom)}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-white/10 hover:text-content"
          onClick={() => zoomFromCenter(1.2)}
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Fit to screen"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-white/10 hover:text-content"
          onClick={fit}
        >
          <Maximize className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
