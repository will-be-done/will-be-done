import { useEffect } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isInputElement } from "@/utils/isInputElement.ts";
import { getModelDropTarget, isModelDNDData } from "@/lib/dnd/models";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  appHandleDrop,
  type AttachmentParentType,
  dailyEntryType,
  isTask,
  itemsOfListItems,
  noteType,
  setItemCoverAttachment,
  stashEntryType,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import {
  useAsyncDispatch,
  useDB,
  useSelectAsync,
} from "@will-be-done/hyperdb/react";
import { replayAndFocus } from "@/store/undo";
import {
  FocusKey,
  focusElementByKey,
  parseColumnKey,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { isApple } from "@/components/RichText/keys";
import {
  getDraggedSelectionKeys,
  useSelectionActions,
} from "@/components/Selection/useSelectionActions";
import {
  copyItems,
  isItemClipboardEvent,
  itemPasteOf,
  useClipboardStore,
} from "@/components/Selection/clipboard";
import {
  getDOMSiblings,
  getDOMColumnSiblingFirstItems,
} from "@/components/Focus/domNavigation.ts";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcuts/KeyboardShortcutsDialog";
import { QuickAddDialog } from "@/components/QuickAdd/QuickAddDialog";
import { SearchDialog } from "@/components/Search/SearchDialog";
import {
  attachFilesToItem,
  isImageAttachment,
  useAttachmentTransfers,
} from "@/components/Attachments/attachmentFiles";
import { pastedFiles } from "@/components/RichText/filePaste";

const hasEditHistoryMenu = () => !!window.desktopApi?.onEditHistory;

export function GlobalListener() {
  const dispatch = useAsyncDispatch();
  const db = useDB();
  const select = useSelectAsync();
  const selection = useSelectionActions();
  const attachmentTransfers = useAttachmentTransfers();

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

  // A file dropped where nothing takes it would replace the app with the file.
  useEffect(() => {
    const refuseFiles = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes("Files")) {
        return;
      }
      if (e.type === "dragover") {
        // Editors accept drops natively and handle them on drop.
        if (
          e.target instanceof Element &&
          e.target.closest('[contenteditable="true"], input, textarea')
        ) {
          return;
        }
        e.dataTransfer.dropEffect = "none";
      }
      e.preventDefault();
    };
    window.addEventListener("dragover", refuseFiles);
    window.addEventListener("drop", refuseFiles);
    return () => {
      window.removeEventListener("dragover", refuseFiles);
      window.removeEventListener("drop", refuseFiles);
    };
  }, []);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => copyItems(e, "copy");
    const handleCut = (e: ClipboardEvent) => copyItems(e, "cut");
    const handlePaste = (e: ClipboardEvent) => {
      const files = pastedFiles(e.clipboardData);
      const focusKey = useFocusStore.getState().focusItemKey;
      const parsed = focusKey ? parseColumnKey(focusKey) : null;
      const hasImage = files.some((file) => isImageAttachment(file.type));
      const isSupportedItem =
        parsed?.type === taskType ||
        parsed?.type === taskTemplateType ||
        parsed?.type === noteType ||
        parsed?.type === dailyEntryType ||
        parsed?.type === stashEntryType;

      if (hasImage && parsed && isSupportedItem && isItemClipboardEvent(e)) {
        e.preventDefault();
        void (async () => {
          let parent:
            | { parentType: AttachmentParentType; parentId: string }
            | undefined;
          if (
            parsed.type === taskType ||
            parsed.type === taskTemplateType ||
            parsed.type === noteType
          ) {
            parent = { parentType: parsed.type, parentId: parsed.id };
          } else if (
            parsed.type === dailyEntryType ||
            parsed.type === stashEntryType
          ) {
            const [task] = await select({
              selector: itemsOfListItems,
              args: {
                listItems: [{ id: parsed.id, modelType: parsed.type }],
              },
            });
            if (task && isTask(task)) {
              parent = { parentType: task.type, parentId: task.id };
            }
          }
          if (!parent) return;

          const added = await attachFilesToItem(
            attachmentTransfers,
            parent.parentType,
            parent.parentId,
            files,
          );
          const cover = added.find((attachment) =>
            isImageAttachment(attachment.mimeType),
          );
          if (!cover) return;
          await dispatch(
            setItemCoverAttachment({
              ...parent,
              attachmentId: cover.id,
            }),
          );
        })();
        return;
      }

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
  }, [attachmentTransfers, dispatch, select, selection]);

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
      <SearchDialog />
    </>
  );
}
