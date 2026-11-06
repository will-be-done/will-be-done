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
  isNote,
  isTask,
  itemsOfListItems,
  type ListItemType,
  type MindmapNode,
  type MindmapPlacement,
  type MindmapTreeNode,
  type MindmapTree,
  moveListItemsToProject,
  moveMindmapNodes,
  moveNoteToProject,
  moveTaskToProject,
  pasteMindmapNodes,
  pasteMindmapOutline,
  placeMindmapItems,
  removeFromDailyList,
  scheduleListItems,
  scheduleTask,
  setListItemsTaskState,
  stashListItems,
  STASH_ID,
  stashType,
  taskHasNoteIncompatibleData,
  taskType,
  toggleTaskState,
  trashNotes,
  trashTasks,
  unscheduleListItems,
  updateMindmapNode,
} from "@will-be-done/slices/space";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import { Maximize, Minus, Plus } from "lucide-react";
import {
  buildFocusKey,
  type FocusKey,
  parseColumnKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { useClipboardStore } from "@/components/Selection/clipboard";
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
  layoutMindmapRoots,
} from "./mindmapLayout.ts";
import {
  type CanvasIndex,
  type CanvasNode,
  type DraggedItems,
  type Direction,
  type DropPreview,
  type NodeKind,
  branchColor,
  dropIntentAt,
  ghostSourceId,
  indexMindmapTree,
  isFloatingRoot,
  isGhostId,
  layoutRootsOf,
  nodeKind,
  placementOfIntent,
  rangeOf,
  subtreeIds,
  treeMoveOf,
  useMindmapDatePicker,
  useMindmapDrop,
  useMindmapMenu,
  useMindmapSelection,
  visibleNodeOrder,
  withDropGhostsOnRoots,
} from "./mindmapModel.ts";
import { mindmapDragSource } from "./mindmapDnd.ts";
import { clipboardOutline } from "./clipboardOutline.ts";
import { MindmapGhostCard } from "./MindmapGhostCard.tsx";
import { MindmapMobileToolbar } from "./MindmapMobileToolbar.tsx";
import { mindmapNodeFocusKey } from "./focusKeys.ts";
import { createNodeSizeStore } from "./nodeSizes.ts";
import {
  MindmapNodeCard,
  type MindmapNodeActions,
} from "./MindmapNodeCard.tsx";

type View = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };
type Pending = { key: FocusKey; focus: boolean; center?: boolean };

// Survives navigating between maps within a session.
const savedViews = new Map<string, View>();
const estimatedSize: Size = { width: 120, height: 32 };
const minZoom = 0.2;
const maxZoom = 2.5;
const revealPadding = 48;
// A touch that travels less than this is a tap.
const tapSlop = 8;
const doubleTapMs = 300;
const doubleTapSlop = 24;
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

type ListItemRef = { id: string; modelType: ListItemType };

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
  const roots = useMemo(() => layoutRootsOf(tree), [tree]);
  // Drops are picked on the map without their own preview.
  const baseLayout = useMemo(
    () => layoutMindmapRoots(roots, sizeOf),
    [roots, sizeOf],
  );
  const layout = useMemo(
    () =>
      preview
        ? layoutMindmapRoots(
            withDropGhostsOnRoots(roots, mindmapId, preview),
            sizeOf,
          )
        : baseLayout,
    [baseLayout, mindmapId, preview, roots, sizeOf],
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
  const latestRef = useRef({ index, baseLayout, tree });
  useLayoutEffect(() => {
    latestRef.current = { index, baseLayout, tree };
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
    const parentOf = (id: string | null) =>
      id === null ? undefined : index.nodes.get(id);
    for (
      let parent = parentOf(entry.parentId);
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

  useEffect(() => sizeStore.disconnect, [sizeStore]);

  useEffect(
    () => () => {
      useMindmapSelection.getState().clear();
      useMindmapDrop.getState().setPreview(null);
    },
    [],
  );

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

  // The node whose item is being moved to another project, with the items of
  // the selection it belongs to.
  const [moving, setMoving] = useState<{
    nodeId: string;
    items: ListItemRef[] | null;
  } | null>(null);
  const movingItemNodeId = moving?.nodeId ?? null;

  const actions: MindmapNodeActions = useMemo(() => {
    const entryOf = (id: string) => latestRef.current.index.nodes.get(id);
    const parentKeyOf = (id: string) => {
      const entry = entryOf(id);
      return entry?.kind === "node" && entry.parentId !== null
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
    // The selection, with the node focused before a modifier click in it.
    const selectionWithFocused = () => {
      const ids = new Set(useMindmapSelection.getState().ids);
      const focusKey = useFocusStore.getState().focusItemKey;
      const focusedId = focusKey
        ? latestRef.current.index.byFocusKey.get(focusKey)
        : undefined;
      if (
        ids.size === 0 &&
        focusedId !== undefined &&
        entryOf(focusedId)?.kind === "node"
      ) {
        ids.add(focusedId);
      }
      return ids;
    };
    // Each item once, though several selected nodes may show it.
    const selectedItems = (): ListItemRef[] => {
      const items = new Map<string, ListItemRef>();
      for (const id of useMindmapSelection.getState().ids) {
        const entry = entryOf(id);
        const item =
          entry?.kind === "node"
            ? (entry.tree.task ?? entry.tree.note)
            : undefined;
        if (item) items.set(item.id, { id: item.id, modelType: item.type });
      }
      return [...items.values()];
    };
    // The items an item key acts on when the node is in a selection.
    const selectedItemsWith = (id: string) => {
      const { ids } = useMindmapSelection.getState();
      return ids.size > 1 && ids.has(id) ? selectedItems() : null;
    };
    const latestTask = (taskId: string) => {
      for (const entry of latestRef.current.index.nodes.values()) {
        if (entry.kind === "node" && entry.tree.task?.id === taskId) {
          return entry.tree.task;
        }
      }
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
        // A removed floating root falls back to the center topic.
        survivor = entryOf(survivor.parentId ?? mindmapId);
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
        // A root has no siblings; it grows a main branch instead.
        const entry = entryOf(id);
        if (entry?.kind !== "node" || entry.parentId === null) {
          void create({ parentId: id, position: "last" }, "topic");
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
        const next = new Set(selectionWithFocused());
        if (next.has(id)) next.delete(id);
        else next.add(id);
        useMindmapSelection.getState().setIds(next, id);
      },
      selectRangeTo: (id) => {
        if (entryOf(id)?.kind !== "node") return;
        const selection = useMindmapSelection.getState();
        const focusKey = useFocusStore.getState().focusItemKey;
        const anchor =
          (selection.ids.size > 0 ? selection.anchorId : null) ??
          (focusKey ? latestRef.current.index.byFocusKey.get(focusKey) : null);
        if (!anchor || entryOf(anchor)?.kind !== "node") {
          selection.setIds(new Set([id]), id);
          return;
        }
        selection.setIds(
          new Set(
            rangeOf(visibleNodeOrder(latestRef.current.tree), anchor, id),
          ),
          anchor,
        );
      },
      discardIfEmpty: (id, refocus) => {
        const entry = entryOf(id);
        // A title may have synced in since editing began.
        if (
          entry?.kind !== "node" ||
          entry.tree.children.length > 0 ||
          entry.tree.node.title.trim()
        ) {
          return;
        }
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
        const items = selectedItemsWith(id);
        if (items) {
          // Done unless every task already is, as in a list.
          const tasks = items.flatMap((ref) => {
            const task = latestTask(ref.id);
            return task ? [task] : [];
          });
          void dispatch(
            setListItemsTaskState({
              listItems: items,
              state: tasks.some((task) => task.state === "todo")
                ? "done"
                : "todo",
            }),
          );
          return;
        }
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
        const items = selectedItemsWith(id);
        if (items) setMoving({ nodeId: id, items });
        else if (itemOf(id)) setMoving({ nodeId: id, items: null });
      },
      schedule: (id) => {
        if (selectedItemsWith(id)) {
          useMindmapDatePicker.getState().setNodeId(id, true);
        } else if (taskOf(id)) {
          useMindmapDatePicker.getState().setNodeId(id);
        }
      },
      scheduleSelection: (date) => {
        const items = selectedItems();
        if (items.length > 0) {
          void dispatch(
            scheduleListItems({ listItems: items, date: getDMY(date) }),
          );
        }
      },
      unscheduleSelection: () => {
        const items = selectedItems();
        if (items.length > 0) {
          void dispatch(unscheduleListItems({ listItems: items }));
        }
      },
      scheduleToday: (id) => {
        const items = selectedItemsWith(id);
        if (items) {
          void dispatch(
            scheduleListItems({ listItems: items, date: getDMY(new Date()) }),
          );
          return;
        }
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
        const items = selectedItemsWith(id);
        if (items) {
          void dispatch(unscheduleListItems({ listItems: items }));
          return;
        }
        const task = taskOf(id);
        if (task) void dispatch(removeFromDailyList({ taskId: task.id }));
      },
      stash: (id) => {
        const items = selectedItemsWith(id);
        if (items) {
          const todo = items.filter(
            (ref) => latestTask(ref.id)?.state === "todo",
          );
          if (todo.length > 0) {
            void dispatch(stashListItems({ listItems: todo }));
          }
          return;
        }
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
  }, [dispatch, focusNode, mindmapId, select]);

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

  // A tap or click on empty space clears focus and the selection.
  const deselect = () => {
    useFocusStore.getState().resetFocus();
    useMindmapSelection.getState().clear();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Touch: one finger pans, two pinch to zoom, a tap on empty space deselects
  // and a double tap there starts a floating topic. Long-pressing a node
  // starts the browser's drag, which cancels the touch.
  const touchesRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{ distance: number; mid: Point; view: View } | null>(
    null,
  );
  const tapRef = useRef<{ start: Point; onCanvas: boolean } | null>(null);
  const lastTapRef = useRef<{ at: number; point: Point } | null>(null);
  const lastPointerTypeRef = useRef("");

  const startPinch = () => {
    const [a, b] = touchesRef.current.values();
    const rect = viewportRef.current?.getBoundingClientRect();
    pinchRef.current =
      a && b && rect
        ? {
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            mid: {
              x: (a.x + b.x) / 2 - rect.left,
              y: (a.y + b.y) / 2 - rect.top,
            },
            view: viewRef.current,
          }
        : null;
  };

  const handleTouchDown = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    // A touch whose end was lost would otherwise count as a finger.
    if (e.isPrimary) touches.clear();
    if (e.target instanceof Element && isInputElement(e.target)) return;
    const point = { x: e.clientX, y: e.clientY };
    touches.set(e.pointerId, point);
    tapRef.current =
      touches.size === 1
        ? {
            start: point,
            onCanvas: !(
              e.target instanceof Element &&
              e.target.closest("[data-mindmap-node], button")
            ),
          }
        : null;
    if (touches.size === 2) startPinch();
  };

  const handleTouchMove = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    const last = touches.get(e.pointerId);
    if (!last) return;
    const point = { x: e.clientX, y: e.clientY };
    const tap = tapRef.current;
    if (tap) {
      if (Math.hypot(point.x - tap.start.x, point.y - tap.start.y) < tapSlop) {
        return;
      }
      tapRef.current = null;
    }
    touches.set(e.pointerId, point);

    const pinch = pinchRef.current;
    if (!pinch) {
      const view = viewRef.current;
      applyView({
        ...view,
        x: view.x + point.x - last.x,
        y: view.y + point.y - last.y,
      });
      return;
    }
    const [a, b] = touches.values();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!a || !b || !rect) return;
    const zoom = Math.min(
      maxZoom,
      Math.max(
        minZoom,
        (pinch.view.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
      ),
    );
    const mid = {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    };
    // The map point first under the fingers stays under them.
    applyView({
      zoom,
      x: mid.x - ((pinch.mid.x - pinch.view.x) / pinch.view.zoom) * zoom,
      y: mid.y - ((pinch.mid.y - pinch.view.y) / pinch.view.zoom) * zoom,
    });
  };

  const handleTouchUp = (e: React.PointerEvent) => {
    const touches = touchesRef.current;
    if (!touches.delete(e.pointerId)) return;
    // The fingers left keep panning or pinching from where they are.
    if (touches.size >= 2) startPinch();
    else pinchRef.current = null;
    const tap = tapRef.current;
    tapRef.current = null;
    if (!tap?.onCanvas || e.type !== "pointerup") return;

    const last = lastTapRef.current;
    if (
      last &&
      e.timeStamp - last.at < doubleTapMs &&
      Math.hypot(e.clientX - last.point.x, e.clientY - last.point.y) <
        doubleTapSlop
    ) {
      lastTapRef.current = null;
      addFloatingTopic(e);
      return;
    }
    lastTapRef.current = { at: e.timeStamp, point: tap.start };
    deselect();
  };

  // Dragging empty space selects with a rectangle; the middle button pans.
  const handlePointerDown = (e: React.PointerEvent) => {
    lastPointerTypeRef.current = e.pointerType;
    if (e.pointerType === "touch") {
      handleTouchDown(e);
      return;
    }
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
    if (e.pointerType === "touch") {
      handleTouchMove(e);
      return;
    }
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
    // A box has no anchor; a later Shift-click starts from the focused node.
    useMindmapSelection.getState().setIds(ids, null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") {
      handleTouchUp(e);
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (gesture.kind !== "marquee") return;
    if (marqueeRef.current) marqueeRef.current.style.display = "none";
    if (!gesture.moved) {
      deselect();
      return;
    }
    useFocusStore.getState().resetFocus();
    // Keys reach the canvas handler only from inside the viewport.
    viewportRef.current?.focus({ preventScroll: true });
  };

  const movingEntry = movingItemNodeId
    ? index.nodes.get(movingItemNodeId)
    : undefined;
  const movingItem =
    movingEntry?.kind === "node"
      ? (movingEntry.tree.task ?? movingEntry.tree.note)
      : undefined;

  // Clipboard events reach nodes only when no text field or text selection
  // would take them. Handled events are marked, so the list handlers skip
  // them.
  const clipboardTarget = (e: React.ClipboardEvent) => {
    const focus = useFocusStore.getState();
    if (
      focus.isFocusDisabled ||
      focus.editItemKey ||
      !e.clipboardData ||
      (e.target instanceof Element && isInputElement(e.target)) ||
      !(window.getSelection()?.isCollapsed ?? true)
    ) {
      return null;
    }
    return focus.focusItemKey
      ? index.byFocusKey.get(focus.focusItemKey)
      : undefined;
  };

  const handleCopy = (e: React.ClipboardEvent, mode: "copy" | "cut") => {
    const focusedId = clipboardTarget(e);
    if (focusedId === null) return;
    const selection = useMindmapSelection.getState().ids;
    const picked = new Set(
      selection.size > 0 ? selection : focusedId ? [focusedId] : [],
    );
    // In map order; the central topic stays.
    const entries = [...index.nodes.values()].filter(
      (entry): entry is CanvasNode & { kind: "node" } =>
        entry.kind === "node" && picked.has(entry.id),
    );
    if (entries.length === 0) return;

    // An indented outline, for pasting as text elsewhere.
    const lines: string[] = [];
    const outline = (tree: MindmapTreeNode, depth: number) => {
      const title = (tree.task ?? tree.note ?? tree.node).title;
      lines.push(
        "  ".repeat(depth) + richTextMarkdownToPlainText(title, "title"),
      );
      for (const child of tree.children) outline(child, depth + 1);
    };
    const isUnderPicked = (entry: CanvasNode & { kind: "node" }) => {
      let parentId = entry.parentId;
      while (parentId !== null) {
        if (picked.has(parentId)) return true;
        const parent = index.nodes.get(parentId);
        parentId = parent?.kind === "node" ? parent.parentId : null;
      }
      return false;
    };
    // A paste copies these nodes, so children added later stay out.
    const nodeIds: string[] = [];
    const collect = (tree: MindmapTreeNode) => {
      nodeIds.push(tree.node.id);
      tree.children.forEach(collect);
    };
    for (const entry of entries) {
      if (isUnderPicked(entry)) continue;
      outline(entry.tree, 0);
      collect(entry.tree);
    }
    const text = lines.join("\n");

    e.preventDefault();
    e.clipboardData.setData("text/plain", text);
    useClipboardStore.setState({
      clipboard: {
        mode,
        keys: [
          ...new Set(
            entries.flatMap(({ tree }) => {
              const item = tree.task ?? tree.note;
              return item ? [buildFocusKey(item.id, item.type)] : [];
            }),
          ),
        ],
        text,
        mindmap: { mindmapId, nodeIds },
      },
    });
  };

  // Pastes under the focused node, or the central topic, and selects what
  // was pasted. Items copied in a list are placed on the map, not copied;
  // anything else pastes as an outline of new topics.
  const handlePaste = (e: React.ClipboardEvent) => {
    const focusedId = clipboardTarget(e);
    if (focusedId === null) return;
    const text = e.clipboardData.getData("text/plain");
    const normalize = (text: string) => text.replace(/\r\n/g, "\n");
    const stored = useClipboardStore.getState().clipboard;
    const clipboard =
      stored && normalize(text) === normalize(stored.text) ? stored : null;
    const lines = clipboard ? [] : clipboardOutline(e.clipboardData);
    if (!clipboard && lines.length === 0) return;
    e.preventDefault();

    const targetId = focusedId ?? mindmapId;
    const target = index.nodes.get(targetId);
    if (clipboard?.mode === "cut") {
      // A cut cannot go into itself.
      const cutIds = new Set(
        clipboard.mindmap?.mindmapId === mindmapId
          ? clipboard.mindmap.nodeIds
          : [],
      );
      for (
        let at: CanvasNode | undefined = target;
        at?.kind === "node";
        at = at.parentId === null ? undefined : index.nodes.get(at.parentId)
      ) {
        if (cutIds.has(at.id)) return;
      }
      useClipboardStore.setState({ clipboard: null });
    }
    if (target?.kind === "node" && target.tree.node.collapsed) {
      void dispatch(
        updateMindmapNode({ id: targetId, node: { collapsed: false } }),
      );
    }

    const placement = { parentId: targetId, position: "last" } as const;
    void (async () => {
      let pasted: MindmapNode[];
      if (!clipboard) {
        pasted = await dispatch(
          pasteMindmapOutline({ mindmapId, lines, placement }),
        );
      } else if (clipboard.mindmap) {
        pasted = await dispatch(
          pasteMindmapNodes({
            mindmapId,
            ids: clipboard.mindmap.nodeIds,
            placement,
            mode: clipboard.mode,
          }),
        );
      } else {
        const items = await select({
          selector: itemsOfListItems,
          args: {
            listItems: clipboard.keys.map((key) => {
              const { id, type } = parseColumnKey(key);
              return { id, modelType: type as ListItemType };
            }),
          },
        });
        pasted = await dispatch(
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
      }
      const last = pasted.at(-1);
      if (!last) return;
      focusNode(mindmapNodeFocusKey(last));
      if (pasted.length > 1) {
        useMindmapSelection
          .getState()
          .setIds(
            new Set(pasted.map((node) => node.id)),
            pasted[0]?.id ?? null,
          );
      }
    })();
  };

  const addFloatingTopic = (at: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const view = viewRef.current;
    void (async () => {
      editNode(
        await dispatch(
          createMindmapNode({
            mindmapId,
            placement: {
              x: (at.clientX - rect.left - view.x) / view.zoom,
              y: (at.clientY - rect.top - view.y) / view.zoom,
            },
          }),
        ),
      );
    })();
  };

  // Double-clicking empty space starts a floating topic there. Touch double
  // taps are handled as taps, whether or not the browser also sends this.
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (
      lastPointerTypeRef.current === "touch" ||
      (e.target instanceof Element &&
        e.target.closest("[data-mindmap-node], button"))
    ) {
      return;
    }
    addFloatingTopic(e);
  };

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
  };

  return (
    <div
      ref={viewportRef}
      tabIndex={-1}
      className="relative min-h-0 flex-1 touch-none overflow-hidden outline-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      onCopy={(e) => handleCopy(e, "copy")}
      onCut={(e) => handleCopy(e, "cut")}
      onPaste={handlePaste}
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

      {movingEntry?.kind === "node" && (movingItem || moving?.items) && (
        <MoveModal
          keepsFocus
          exceptProjectId={
            moving?.items ? undefined : (movingEntry.tree.project?.id ?? "")
          }
          setIsOpen={(open) => {
            if (open) return;
            setMoving(null);
            focusNode(movingEntry.focusKey, true);
          }}
          handleMove={(projectId) => {
            if (moving?.items) {
              void dispatch(
                moveListItemsToProject({ listItems: moving.items, projectId }),
              );
            } else if (movingItem) {
              void dispatch(
                isTask(movingItem)
                  ? moveTaskToProject({ taskId: movingItem.id, projectId })
                  : moveNoteToProject({ noteId: movingItem.id, projectId }),
              );
            }
          }}
        />
      )}

      <MindmapMobileToolbar index={index} actions={actions} />

      <div
        ref={marqueeRef}
        className="pointer-events-none absolute left-0 top-0 hidden rounded-sm border border-accent/70 bg-accent/10"
      />

      {tree.branches.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[12px] text-content-tinted/60">
          Select the central topic and press Tab to add a topic, drag tasks and
          notes here from the projects below, or double-click anywhere for a
          floating topic.
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
