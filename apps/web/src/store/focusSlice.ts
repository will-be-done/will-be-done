import { shouldNeverHappen } from "@/utils.ts";
import {
  getDOMSelectableRange,
  isDOMSelectable,
} from "@/components/Focus/domNavigation.ts";
import { create } from "zustand";
import {
  dailyEntryType,
  projectSectionType,
  stashEntryType,
  stashType,
} from "@will-be-done/slices/space";

export type FocusKey = string & { __brand: never };

export const buildFocusKey = (
  id: string,
  type: string,
  component?: string,
): FocusKey => {
  if (id.includes("^^")) {
    throw new Error("id cannot contain ^^");
  }
  if (type.includes("^^")) {
    throw new Error("type cannot contain ^^");
  }
  if (component && component.includes("^^")) {
    throw new Error("component cannot contain ^^");
  }

  return `${type}^^${id}${component ? `^^${component}` : ""}` as FocusKey;
};

export const parseColumnKey = (
  key: FocusKey,
): {
  type:
    | "template"
    | "note"
    | "dailyList"
    | "project"
    | "task"
    | typeof projectSectionType
    | typeof dailyEntryType
    | typeof stashEntryType
    | typeof stashType;
  id: string;
  component?: string;
} => {
  const [type, id, component] = key.split("^^");

  if (!type || !id) return shouldNeverHappen("key is not valid", { key });

  return {
    type: type as
      | "template"
      | "note"
      | "dailyList"
      | "project"
      | "task"
      | typeof projectSectionType
      | typeof dailyEntryType
      | typeof stashEntryType
      | typeof stashType,
    id,
    component,
  };
};

let preparedTextInput: HTMLTextAreaElement | null = null;

const removePreparedTextInput = () => {
  preparedTextInput?.remove();
  preparedTextInput = null;
};

export const prepareTextInputFocus = () => {
  if (typeof document === "undefined") return;

  removePreparedTextInput();

  const textarea = document.createElement("textarea");
  textarea.setAttribute("aria-hidden", "true");
  textarea.tabIndex = -1;
  textarea.autocapitalize = "off";
  textarea.autocomplete = "off";
  textarea.spellcheck = false;
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0.01";
  textarea.style.pointerEvents = "none";
  textarea.style.zIndex = "-1";

  document.body.append(textarea);
  preparedTextInput = textarea;
  textarea.focus({ preventScroll: true });

  window.setTimeout(() => {
    if (preparedTextInput === textarea) removePreparedTextInput();
  }, 1500);
};

export const focusTextareaAtEnd = (textarea: HTMLTextAreaElement) => {
  textarea.focus({ preventScroll: true });

  const end = textarea.value.length;
  textarea.setSelectionRange(end, end);
  const focused = document.activeElement === textarea;
  if (focused) removePreparedTextInput();
  return focused;
};

export const focusTaskTitleTextareaByKey = (key: FocusKey) => {
  const root = document.querySelector<HTMLElement>(
    `[data-focusable-key="${key}"]`,
  );
  const textarea = root?.querySelector<HTMLTextAreaElement>(
    "[data-task-title-input]",
  );

  if (!textarea) return false;

  return focusTextareaAtEnd(textarea);
};

export const focusElementByKey = (key: FocusKey) => {
  const elements = document.querySelectorAll<HTMLElement>(
    '[data-focusable-key="' + key + '"]',
  );

  if (!elements.length) {
    shouldNeverHappen("focusable element not found", { key });
    return;
  }

  if (elements.length > 1) {
    shouldNeverHappen("focusable element > 1", { key, elements });
    return;
  }

  const el = elements[0];

  if (el) {
    el.focus({ preventScroll: true });
    scrollFocusedIntoView(el);
  }
};

export const scrollFocusedIntoView = (el: HTMLElement) => {
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  // Side by side, a column scrolls in whole, so its header shows with the
  // item. This later scroll takes over the horizontal one above.
  el.closest(
    '[data-focus-region-direction="row"] [data-focus-column]',
  )?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
};

interface FocusState {
  focusItemKey: FocusKey | null;
  editItemKey: FocusKey | null;
  isFocusDisabled: boolean;
  // Multi-selection: empty, or at least two keys. A single selected item is
  // just the focused one.
  selectedKeys: FocusKey[];
  selectionAnchorKey: FocusKey | null;
  isDraggingSelection: boolean;
}

interface FocusActions {
  disableFocus: () => void;
  enableFocus: () => void;
  focusByKey: (key: FocusKey, skipElFocus?: boolean) => void;
  editByKey: (key: FocusKey) => void;
  resetFocus: () => void;
  resetEdit: () => void;
  selectRangeTo: (key: FocusKey) => void;
  toggleSelected: (key: FocusKey) => void;
  setSelectedKeys: (keys: FocusKey[]) => void;
  clearSelection: () => void;
  setIsDraggingSelection: (isDragging: boolean) => void;
}

const emptySelection = {
  selectedKeys: [] as FocusKey[],
  selectionAnchorKey: null,
};

export const useFocusStore = create<FocusState & FocusActions>((set, get) => ({
  focusItemKey: null,
  editItemKey: null,
  isFocusDisabled: false,
  ...emptySelection,
  isDraggingSelection: false,

  disableFocus: () => set({ isFocusDisabled: true }),
  enableFocus: () => set({ isFocusDisabled: false }),

  focusByKey: (key: FocusKey, skipElFocus = false) => {
    const { focusItemKey, selectedKeys } = get();
    if (focusItemKey === key) return;

    set({
      focusItemKey: key,
      editItemKey: null,
      ...(selectedKeys.includes(key) ? {} : emptySelection),
    });

    if (skipElFocus) return;

    setTimeout(() => focusElementByKey(key), 0);
  },

  editByKey: (key: FocusKey) => {
    if (get().editItemKey === key) return;

    set({ focusItemKey: key, editItemKey: key, ...emptySelection });
  },

  resetFocus: () =>
    set({ focusItemKey: null, editItemKey: null, ...emptySelection }),
  resetEdit: () => set({ editItemKey: null }),

  selectRangeTo: (key: FocusKey) => {
    const { selectionAnchorKey, selectedKeys, focusItemKey } = get();
    const anchor =
      (selectedKeys.length > 0 ? selectionAnchorKey : focusItemKey) ?? key;
    const range = getDOMSelectableRange(anchor, key);

    set({
      focusItemKey: key,
      editItemKey: null,
      ...(range.length > 1
        ? { selectedKeys: range, selectionAnchorKey: anchor }
        : emptySelection),
    });
  },

  toggleSelected: (key: FocusKey) => {
    const { selectedKeys, focusItemKey } = get();
    const current =
      selectedKeys.length > 0
        ? selectedKeys
        : focusItemKey && isDOMSelectable(focusItemKey)
          ? [focusItemKey]
          : [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];

    if (next.length > 1) {
      set({
        focusItemKey: key,
        editItemKey: null,
        selectedKeys: next,
        selectionAnchorKey: key,
      });
    } else {
      set({
        focusItemKey: next[0] ?? key,
        editItemKey: null,
        ...emptySelection,
      });
    }
  },

  setSelectedKeys: (keys: FocusKey[]) =>
    set(
      keys.length > 1
        ? { selectedKeys: keys, selectionAnchorKey: keys[0] }
        : emptySelection,
    ),

  clearSelection: () => {
    if (get().selectedKeys.length === 0) return;
    set(emptySelection);
  },

  setIsDraggingSelection: (isDraggingSelection: boolean) =>
    set({ isDraggingSelection }),
}));
