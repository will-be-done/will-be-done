import { type RefObject, useMemo, useState } from "react";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  appHandleDrop,
  appHandleDropMany,
  convertMindmapNodes,
  createItem as createChecklistItem,
  createMindmapNode,
  createMindmapNote,
  createMindmapTask,
  deleteMindmapNodes,
  getDMY,
  type ListItemType,
  type MindmapNode,
  type MindmapPlacement,
  type MindmapTree,
  moveMindmapNodes,
  projectSectionType,
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
import { type FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { focusChecklistItem } from "@/components/Checklist/focus";
import { captureWebAnalytics } from "@/lib/analytics";
import {
  useItemDetailsEditRequest,
  useItemDetailsOpen,
} from "@/components/ItemDetails/ItemDetailsStore.ts";
import type { MindmapLayout } from "./mindmapLayout.ts";
import {
  type CanvasIndex,
  mapNodeOrder,
  type NodeKind,
  nodeKind,
  rangeOf,
  subtreeIds,
  treeMoveOf,
  useMindmapDatePicker,
  useMindmapSelection,
  visibleNodeOrder,
} from "./mindmapModel.ts";
import { mindmapNodeFocusKey } from "./focusKeys.ts";
import type { MindmapNodeActions } from "./MindmapNodeCard.tsx";

export type ListItemRef = { id: string; modelType: ListItemType };

// The tree as of the last render, for handlers created once.
export type LatestMindmap = {
  index: CanvasIndex;
  baseLayout: MindmapLayout;
  tree: MindmapTree;
};

// What a node's keys, toolbar, and menu do.
export function useMindmapActions({
  mindmapId,
  projectId,
  latestRef,
  register,
  focusNode,
  editNode,
}: {
  mindmapId: string;
  projectId: string | undefined;
  latestRef: RefObject<LatestMindmap>;
  register: MindmapNodeActions["register"];
  focusNode: (key: FocusKey, keepSelection?: boolean) => void;
  editNode: (node: MindmapNode) => void;
}) {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();

  // The node whose item is being moved to another project, with the items of
  // the selection it belongs to.
  const [moving, setMoving] = useState<{
    nodeId: string;
    items: ListItemRef[] | null;
  } | null>(null);

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
    // The selected nodes in map order when the node is in a selection.
    const selectedNodesWith = (id: string) => {
      const { ids } = useMindmapSelection.getState();
      if (ids.size < 2 || !ids.has(id)) return null;
      return mapNodeOrder(latestRef.current.tree).filter((nodeId) =>
        ids.has(nodeId),
      );
    };
    // Whether any of the nodes' tasks has data a note cannot keep.
    const losesNoteData = async (ids: string[]) => {
      for (const id of ids) {
        const task = taskOf(id);
        if (
          task &&
          (await select({
            selector: taskHasNoteIncompatibleData,
            args: { taskId: task.id },
          }))
        ) {
          return true;
        }
      }
      return false;
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
      register,
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
        const ids = selectedNodesWith(id) ?? [id];
        void (async () => {
          if (
            to === "note" &&
            (await losesNoteData(ids)) &&
            !window.confirm(
              ids.length > 1
                ? "Convert to notes? Schedules, stash entries and checklists of the tasks will be removed."
                : "Convert to note? Its schedule, stash entry and checklist will be removed.",
            )
          ) {
            return;
          }
          const nodes = await dispatch(
            convertMindmapNodes({ ids, to, projectId }),
          );
          const node = nodes.find((n) => n.id === id);
          if (node) focusNode(mindmapNodeFocusKey(node), ids.length > 1);
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
      moveToSection: (id, projectSectionId) => {
        const drops = new Map<string, ListItemRef>();
        for (const nodeId of selectedNodesWith(id) ?? [id]) {
          const item = itemOf(nodeId);
          if (item && item.projectSectionId !== projectSectionId) {
            drops.set(item.id, { id: item.id, modelType: item.type });
          }
        }
        if (drops.size === 0) return;
        void dispatch(
          appHandleDropMany({
            id: projectSectionId,
            modelType: projectSectionType,
            drops: [...drops.values()],
            edge: "bottom",
          }),
        );
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
  }, [
    dispatch,
    editNode,
    focusNode,
    latestRef,
    mindmapId,
    projectId,
    register,
    select,
  ]);

  return { actions, moving, setMoving };
}
