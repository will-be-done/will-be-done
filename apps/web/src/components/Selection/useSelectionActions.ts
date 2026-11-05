import { useMemo } from "react";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  type AnyModelType,
  appHandleDropMany,
  dailyEntriesByTaskIds,
  dailyEntryType,
  dailyListType,
  deleteListItems,
  getDMY,
  itemsByListItemRefs,
  itemsOfListItems,
  isTask,
  type Item,
  type ListItemType,
  moveListItemsToProject,
  pasteListItemCopies,
  scheduleListItems,
  setListItemsNature,
  setListItemsTaskState,
  stashEntriesByTaskIds,
  stashEntryType,
  stashListItems,
  stashType,
  type TaskNature,
  trashListItemTasks,
  unscheduleListItems,
} from "@will-be-done/slices/space";
import {
  buildFocusKey,
  focusElementByKey,
  type FocusKey,
  parseColumnKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import {
  getDOMAdjacentStackedPlaceholder,
  getDOMColumnSiblingDropTarget,
  getDOMSiblings,
  sortDOMSelectableKeys,
} from "@/components/Focus/domNavigation.ts";
import type { ItemClipboard } from "./clipboard";

type ListItemRef = { id: string; modelType: ListItemType };
type ListKind = "section" | "daily" | "stash";

const listKindOf = (modelType: string): ListKind =>
  modelType === dailyListType || modelType === dailyEntryType
    ? "daily"
    : modelType === stashType || modelType === stashEntryType
      ? "stash"
      : "section";

const toRef = (key: FocusKey): ListItemRef => {
  const { id, type } = parseColumnKey(key);
  return { id, modelType: type as ListItemType };
};

const selectedKeysInOrder = () =>
  sortDOMSelectableKeys(useFocusStore.getState().selectedKeys);

// Whether shortcuts should act on a selection. Drops a selection whose items
// left the screen so single-item shortcuts work again.
export const hasMultiSelection = () => {
  const store = useFocusStore.getState();
  if (store.selectedKeys.length === 0) return false;
  if (sortDOMSelectableKeys(store.selectedKeys).length > 1) return true;

  store.clearSelection();
  return false;
};

// Moves focus off a selection that is about to leave the screen.
const focusPastSelection = (keys: FocusKey[]) => {
  const selected = new Set<string>(keys);
  const step = (from: FocusKey | undefined, direction: 0 | 1) => {
    let key: FocusKey | null | undefined = from;
    while (key) {
      key = getDOMSiblings(key)[direction];
      if (key && !selected.has(key)) return key;
    }
    return null;
  };
  const next = step(keys[keys.length - 1], 1) ?? step(keys[0], 0);

  const store = useFocusStore.getState();
  store.clearSelection();
  if (next) store.focusByKey(next);
  else store.resetFocus();
};

export const useSelectionActions = () => {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();

  return useMemo(() => {
    // The key each item has in a list of the given kind, aligned with items.
    const keysInList = async (
      items: (Item | undefined)[],
      kind: ListKind,
    ): Promise<(FocusKey | undefined)[]> => {
      if (kind === "section") {
        return items.map((item) => item && buildFocusKey(item.id, item.type));
      }

      const taskIds = items.flatMap((item) =>
        item && isTask(item) ? [item.id] : [],
      );
      const entries =
        kind === "daily"
          ? await select({
              selector: dailyEntriesByTaskIds,
              args: { taskIds },
            })
          : await select({
              selector: stashEntriesByTaskIds,
              args: { taskIds },
            });
      const entryByTaskId = new Map(
        entries.map((entry) => [entry.taskId, entry]),
      );
      return items.map((item) => {
        const entry = item && entryByTaskId.get(item.id);
        return entry && buildFocusKey(entry.id, entry.type);
      });
    };

    // Selection keys name list rows, so a move into another kind of list
    // (stash, day, project) gives the moved items new keys there. Items are
    // resolved before the move, which may delete the rows the keys name.
    const moveSelection = async (
      keys: FocusKey[],
      target: { id: string; modelType: AnyModelType },
      edge: "top" | "bottom",
      targetListType: string = target.modelType,
    ) => {
      const kind = listKindOf(targetListType);
      const movedKeys = keys.filter(
        (key) => listKindOf(parseColumnKey(key).type) !== kind,
      );
      const movedItems = await select({
        selector: itemsByListItemRefs,
        args: { listItems: movedKeys.map(toRef) },
      });

      await dispatch(
        appHandleDropMany({
          id: target.id,
          modelType: target.modelType,
          drops: keys.map(toRef),
          edge,
        }),
      );

      const remapped = new Map<FocusKey, FocusKey>();
      (await keysInList(movedItems, kind)).forEach((movedKey, index) => {
        const key = movedKeys[index];
        if (key && movedKey) remapped.set(key, movedKey);
      });

      if (remapped.size > 0) {
        useFocusStore.setState((s) => ({
          selectedKeys: s.selectedKeys.map((k) => remapped.get(k) ?? k),
          focusItemKey:
            (s.focusItemKey && remapped.get(s.focusItemKey)) || s.focusItemKey,
        }));
      }
      return keys.map((key) => remapped.get(key) ?? key);
    };

    const refocus = () => {
      const key = useFocusStore.getState().focusItemKey;
      if (key) setTimeout(() => focusElementByKey(key), 0);
    };

    return {
      dropOn: moveSelection,

      // Pastes after the target and selects what was pasted.
      paste: async (clipboard: ItemClipboard, targetKey: FocusKey) => {
        const { id, type } = parseColumnKey(targetKey);
        let keys: (FocusKey | undefined)[];
        if (clipboard.mode === "cut") {
          keys = await moveSelection(
            clipboard.keys,
            { id, modelType: type },
            "bottom",
          );
        } else {
          const copies = await dispatch(
            pasteListItemCopies({
              listItems: clipboard.keys.map(toRef),
              id,
              modelType: type,
              edge: "bottom",
            }),
          );
          keys = await keysInList(copies, listKindOf(type));
        }

        // A sidebar project takes the items off screen.
        if (type === "project") return;

        const pasted = keys.filter((key) => key !== undefined);
        const last = pasted[pasted.length - 1];
        if (!last) return;
        useFocusStore.setState({
          selectedKeys: pasted.length > 1 ? pasted : [],
          selectionAnchorKey: pasted[0],
          focusItemKey: last,
          editItemKey: null,
        });
        refocus();
      },

      toggleDone: async () => {
        const keys = selectedKeysInOrder();
        const items = await select({
          selector: itemsOfListItems,
          args: { listItems: keys.map(toRef) },
        });
        const state = items.some(
          (item) => isTask(item) && item.state === "todo",
        )
          ? "done"
          : "todo";
        await dispatch(
          setListItemsTaskState({ listItems: keys.map(toRef), state }),
        );
      },

      setNature: (nature: NonNullable<TaskNature>) =>
        dispatch(
          setListItemsNature({
            listItems: selectedKeysInOrder().map(toRef),
            nature,
          }),
        ),

      delete: () => {
        const keys = selectedKeysInOrder();
        focusPastSelection(keys);
        return dispatch(deleteListItems({ listItems: keys.map(toRef) }));
      },

      trash: () => {
        const keys = selectedKeysInOrder();
        focusPastSelection(keys);
        return dispatch(trashListItemTasks({ listItems: keys.map(toRef) }));
      },

      stash: () => {
        const keys = selectedKeysInOrder();
        focusPastSelection(keys);
        return dispatch(stashListItems({ listItems: keys.map(toRef) }));
      },

      schedule: (date: Date) =>
        dispatch(
          scheduleListItems({
            listItems: selectedKeysInOrder().map(toRef),
            date: getDMY(date),
          }),
        ),

      unschedule: () =>
        dispatch(
          unscheduleListItems({ listItems: selectedKeysInOrder().map(toRef) }),
        ),

      moveToProject: (projectId: string) => {
        const keys = selectedKeysInOrder();
        // Project items leave the view; daily and stash entries stay put.
        if (
          keys.some((key) => listKindOf(parseColumnKey(key).type) === "section")
        ) {
          focusPastSelection(keys);
        }
        return dispatch(
          moveListItemsToProject({ listItems: keys.map(toRef), projectId }),
        );
      },

      moveStacked: async (direction: "up" | "down") => {
        const keys = selectedKeysInOrder();
        const edgeKey = direction === "up" ? keys[0] : keys[keys.length - 1];
        if (!edgeKey) return;

        const selected = new Set<string>(keys);
        let targetKey: FocusKey | null = edgeKey;
        do {
          targetKey = getDOMSiblings(targetKey, { forMove: true })[
            direction === "up" ? 0 : 1
          ];
        } while (targetKey && selected.has(targetKey));

        const columnOf = (key: string) =>
          document
            .querySelector(`[data-focusable-key="${key}"]`)
            ?.closest("[data-focus-column]");
        const crossedBoundary = targetKey
          ? columnOf(edgeKey) !== columnOf(targetKey)
          : true;
        targetKey ??= getDOMAdjacentStackedPlaceholder(edgeKey, direction);
        if (!targetKey) return;

        const targetColumnType = columnOf(targetKey)?.getAttribute(
          "data-column-model-type",
        );
        if (!targetColumnType) return;

        const edge =
          crossedBoundary === (direction === "up") ? "bottom" : "top";
        const { id, type } = parseColumnKey(targetKey);
        await moveSelection(
          keys,
          { id, modelType: type },
          edge,
          targetColumnType,
        );
        refocus();
      },

      moveColumn: async (direction: "left" | "right") => {
        const keys = selectedKeysInOrder();
        const focusKey = useFocusStore.getState().focusItemKey;
        const fromKey =
          focusKey && keys.includes(focusKey) ? focusKey : keys[0];
        if (!fromKey) return;

        const dropTarget = getDOMColumnSiblingDropTarget(fromKey, direction);
        if (!dropTarget) return;

        const { id, type } = parseColumnKey(dropTarget.targetKey);
        await moveSelection(
          keys,
          { id, modelType: type },
          dropTarget.edge,
          dropTarget.targetColumnModel.type,
        );
        refocus();
      },
    };
  }, [dispatch, select]);
};

// Drag data of an item dragged as part of a multi-selection.
export const selectionDragData = (key: FocusKey) => {
  const { selectedKeys } = useFocusStore.getState();
  if (!selectedKeys.includes(key)) return {};
  return { selectionKeys: sortDOMSelectableKeys(selectedKeys) };
};

export const getDraggedSelectionKeys = (
  data: Record<string | symbol, unknown>,
): FocusKey[] | null =>
  Array.isArray(data.selectionKeys) ? (data.selectionKeys as FocusKey[]) : null;
