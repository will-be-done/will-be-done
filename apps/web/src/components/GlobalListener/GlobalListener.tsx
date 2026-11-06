import { useEffect } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isInputElement } from "@/utils/isInputElement.ts";
import { getModelDropTarget, isModelDNDData } from "@/lib/dnd/models";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { appHandleDrop } from "@will-be-done/slices/space";
import { useAsyncDispatch, useDB } from "@will-be-done/hyperdb/react";
import type { SubscribableDB } from "@will-be-done/hyperdb";
import { replayHistory } from "@/store/undo";
import {
  buildFocusKey,
  FocusKey,
  focusElementByKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { isApple } from "@/components/RichText/keys";
import {
  getDraggedSelectionKeys,
  useSelectionActions,
} from "@/components/Selection/useSelectionActions";
import {
  copyItems,
  itemPasteOf,
  useClipboardStore,
} from "@/components/Selection/clipboard";
import {
  getDOMSiblings,
  getDOMColumnSiblingFirstItems,
} from "@/components/Focus/domNavigation.ts";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcuts/KeyboardShortcutsDialog";
import { QuickAddDialog } from "@/components/QuickAdd/QuickAddDialog";

const hasEditHistoryMenu = () => !!window.desktopApi?.onEditHistory;

const isRendered = (key: FocusKey) =>
  !!document.querySelector(`[data-focusable-key="${CSS.escape(key)}"]`);

// Focus the first replayed row on screen, so a restored item is visible.
const replayAndFocus = async (
  db: SubscribableDB,
  direction: "undo" | "redo",
) => {
  const event = await replayHistory(db, direction);
  if (!event) return;

  const keys = event.changes.flatMap(({ id, before, after }) => {
    const type = (direction === "undo" ? before : after)?.type;
    return typeof type === "string" ? [buildFocusKey(id, type)] : [];
  });
  // Let the views render the replayed rows first.
  setTimeout(() => {
    const focus = useFocusStore.getState();
    const key = keys.find(isRendered);
    if (key) focus.focusByKey(key);
    else if (focus.focusItemKey && !isRendered(focus.focusItemKey)) {
      focus.resetFocus();
    }
  }, 0);
};

export function GlobalListener() {
  const dispatch = useAsyncDispatch();
  const db = useDB();
  const selection = useSelectionActions();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focusState = useFocusStore.getState();
      const isSomethingFocused =
        !focusState.isFocusDisabled && !!focusState.focusItemKey;

      if (focusState.isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;
      if (e.target instanceof HTMLElement && e.target.shadowRoot) {
        return;
      }

      // The macOS desktop Edit menu owns these and calls onEditHistory.
      if (e.code === "KeyZ" && e.metaKey && isApple && hasEditHistoryMenu()) {
        return;
      }

      // Handle undo (cmd+z/ctrl+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) ||
        e.code === "KeyU"
      ) {
        e.preventDefault();
        void replayAndFocus(db, "undo");
        return;
      }

      // Handle redo (cmd+shift+z/ctrl+shift+z)
      if (
        ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && e.shiftKey) ||
        (e.code === "KeyR" && e.ctrlKey)
      ) {
        e.preventDefault();
        void replayAndFocus(db, "redo");
        return;
      }

      if (e.code === "Escape" && focusState.selectedKeys.length > 0) {
        focusState.clearSelection();
        return;
      }

      if (
        e.code === "Escape" &&
        useClipboardStore.getState().clipboard?.mode === "cut"
      ) {
        useClipboardStore.setState({ clipboard: null });
        return;
      }

      if (e.code === "Escape" && !isSomethingFocused) {
        useFocusStore.getState().resetFocus();

        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [db]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const focusState = useFocusStore.getState();

      if (focusState.isFocusDisabled || e.defaultPrevented) return;

      const activeElement =
        e.target instanceof Element ? e.target : document.activeElement;

      // Check if the active element IS any kind of input element
      const isInput = activeElement && isInputElement(activeElement);

      // If it's an input, return early
      if (isInput) return;

      // Ctrl/Cmd combos move items; the item handlers own them.
      if (e.ctrlKey || e.metaKey) return;

      const isUp = e.code === "ArrowUp" || e.code == "KeyK";
      const isDown = e.code === "ArrowDown" || e.code == "KeyJ";
      const isLeft = e.code === "ArrowLeft" || e.code == "KeyH";
      const isRight = e.code === "ArrowRight" || e.code == "KeyL";

      const focusItemKey = useFocusStore.getState().focusItemKey;
      if (focusItemKey && e.shiftKey && (isUp || isDown)) {
        e.preventDefault();

        const [up, down] = getDOMSiblings(focusItemKey);
        const next = isUp ? up : down;
        if (!next) return;

        useFocusStore.getState().selectRangeTo(next);
        focusElementByKey(next);
        return;
      }
      if (e.shiftKey) return;

      if ((isUp || isDown || isLeft || isRight) && focusItemKey) {
        useFocusStore.getState().clearSelection();
      }

      if (focusItemKey && (isUp || isDown)) {
        e.preventDefault();

        const [up, down] = getDOMSiblings(focusItemKey);

        if (isUp) {
          if (!up) return;

          useFocusStore.getState().focusByKey(up);
        } else if (isDown) {
          if (!down) return;

          useFocusStore.getState().focusByKey(down);
        }
      } else if (focusItemKey && (isLeft || isRight)) {
        e.preventDefault();

        const [left, right] = getDOMColumnSiblingFirstItems(focusItemKey);

        if (isLeft) {
          if (!left) return;

          useFocusStore.getState().focusByKey(left);
        } else if (isRight) {
          if (!right) return;

          useFocusStore.getState().focusByKey(right);
        }
      }
    };

    const handleFocus = (event: Event) => {
      const focusedElement = event.target;
      if (!(focusedElement instanceof HTMLElement)) {
        return;
      }

      if (focusedElement.hasAttribute("data-focusable-key")) {
        const focusableKey = focusedElement.getAttribute("data-focusable-key");

        if (focusableKey) {
          useFocusStore.getState().focusByKey(focusableKey as FocusKey, true);
        }
      }
    };

    window.addEventListener("focus", handleFocus, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(
    () =>
      window.desktopApi?.onEditHistory?.((direction) => {
        const active = document.activeElement;
        if (
          useFocusStore.getState().isFocusDisabled ||
          (active && isInputElement(active))
        ) {
          return false;
        }
        void replayAndFocus(db, direction);
        return true;
      }),
    [db],
  );

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => copyItems(e, "copy");
    const handleCut = (e: ClipboardEvent) => copyItems(e, "cut");
    const handlePaste = (e: ClipboardEvent) => {
      const paste = itemPasteOf(e);
      if (!paste) return;

      if (paste.clipboard.mode === "cut") {
        useClipboardStore.setState({ clipboard: null });
        if (paste.clipboard.keys.includes(paste.targetKey)) return;
      }
      void selection.paste(paste.clipboard, paste.targetKey);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
    };
  }, [selection]);

  useEffect(() => {
    return monitorForElements({
      onDragStart: ({ source }) => {
        if (getDraggedSelectionKeys(source.data)) {
          useFocusStore.getState().setIsDraggingSelection(true);
        }
      },
      onDrop: ({ location, source }) => {
        useFocusStore.getState().setIsDraggingSelection(false);
        if (!isModelDNDData(source.data)) return;
        const target = getModelDropTarget(
          source.data,
          location.current.dropTargets,
        );
        if (!target || !isModelDNDData(target.data)) return;

        const closestEdge = extractClosestEdge(target.data);
        // Columns reorder horizontally; slices model "before" as top.
        const edge =
          closestEdge === "left"
            ? "top"
            : closestEdge === "right"
              ? "bottom"
              : closestEdge;

        const selectionKeys = getDraggedSelectionKeys(source.data);
        if (selectionKeys) {
          void selection.dropOn(
            selectionKeys,
            { id: target.data.modelId, modelType: target.data.modelType },
            edge || "top",
          );
          return;
        }

        void dispatch(
          appHandleDrop({
            id: target.data.modelId,
            modelType: target.data.modelType,
            dropId: source.data.modelId,
            dropModelType: source.data.modelType,
            edge: edge || "top",
          }),
        );
      },
    });
  }, [dispatch, selection]);

  return (
    <>
      <KeyboardShortcutsDialog />
      <QuickAddDialog />
    </>
  );
}
