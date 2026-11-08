import { create } from "zustand";
import { type FocusKey, useFocusStore } from "@/store/focusSlice.ts";
import {
  isDOMSelectable,
  sortDOMSelectableKeys,
} from "@/components/Focus/domNavigation.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import { hasMultiSelection } from "./useSelectionActions";

export type ItemClipboard = {
  mode: "copy" | "cut";
  // List keys of the copied tasks and notes, for pasting into lists.
  keys: FocusKey[];
  text: string;
  // Set when the copy came from mindmap nodes, which paste with structure.
  mindmap?: { mindmapId: string; nodeIds: string[] };
};

export const useClipboardStore = create<{ clipboard: ItemClipboard | null }>(
  () => ({ clipboard: null }),
);

const normalizeText = (text: string) => text.replace(/\r\n/g, "\n");

// Clipboard events reach items only when no text field or text selection
// would take them.
const isItemClipboardEvent = (event: ClipboardEvent) => {
  const focus = useFocusStore.getState();
  if (focus.isFocusDisabled || focus.editItemKey || event.defaultPrevented) {
    return false;
  }
  if (event.target instanceof Element && isInputElement(event.target)) {
    return false;
  }
  return window.getSelection()?.isCollapsed ?? true;
};

const sourceKeys = (): FocusKey[] => {
  if (hasMultiSelection()) {
    return sortDOMSelectableKeys(useFocusStore.getState().selectedKeys);
  }
  const key = useFocusStore.getState().focusItemKey;
  return key && isDOMSelectable(key) ? [key] : [];
};

export const copyItems = (event: ClipboardEvent, mode: "copy" | "cut") => {
  if (!event.clipboardData || !isItemClipboardEvent(event)) return;

  const keys = sourceKeys();
  if (keys.length === 0) return;

  const text = keys
    .map(
      (key) =>
        document
          .querySelector(`[data-focusable-key="${key}"]`)
          ?.getAttribute("data-copy-text") ?? "",
    )
    .join("\n");

  event.preventDefault();
  event.clipboardData.setData("text/plain", text);
  useClipboardStore.setState({ clipboard: { mode, keys, text } });
};

// The clipboard and paste target for a paste event, unless the system
// clipboard has changed since the items were copied.
export const itemPasteOf = (event: ClipboardEvent) => {
  if (!event.clipboardData || !isItemClipboardEvent(event)) return null;

  const { clipboard } = useClipboardStore.getState();
  const targetKey = useFocusStore.getState().focusItemKey;
  if (!clipboard || !targetKey) return null;
  if (
    normalizeText(event.clipboardData.getData("text/plain")) !==
    normalizeText(clipboard.text)
  ) {
    return null;
  }

  event.preventDefault();
  return { clipboard, targetKey };
};
