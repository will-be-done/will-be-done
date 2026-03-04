import { shouldNeverHappen } from "@/utils.ts";
import { create } from "zustand";

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
    | "dailyList"
    | "project"
    | "task"
    | "projectCategory"
    | "projection";
  id: string;
  component?: string;
} => {
  const [type, id, component] = key.split("^^");

  if (!type || !id) return shouldNeverHappen("key is not valid", { key });

  return {
    type: type as
      | "template"
      | "dailyList"
      | "project"
      | "task"
      | "projectCategory"
      | "projection",
    id,
    component,
  };
};

interface FocusState {
  focusItemKey: FocusKey | null;
  editItemKey: FocusKey | null;
  isFocusDisabled: boolean;
}

interface FocusActions {
  disableFocus: () => void;
  enableFocus: () => void;
  focusByKey: (key: FocusKey, skipElFocus?: boolean) => void;
  editByKey: (key: FocusKey) => void;
  resetFocus: () => void;
  resetEdit: () => void;
}

export const useFocusStore = create<FocusState & FocusActions>((set, get) => ({
  focusItemKey: null,
  editItemKey: null,
  isFocusDisabled: false,

  disableFocus: () => set({ isFocusDisabled: true }),
  enableFocus: () => set({ isFocusDisabled: false }),

  focusByKey: (key: FocusKey, skipElFocus = false) => {
    if (get().focusItemKey === key) return;

    set({ focusItemKey: key, editItemKey: null });

    if (skipElFocus) return;

    setTimeout(() => {
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
        el.focus();
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }
    }, 0);
  },

  editByKey: (key: FocusKey) => {
    if (get().editItemKey === key) return;

    set({ focusItemKey: key, editItemKey: key });
  },

  resetFocus: () => set({ focusItemKey: null, editItemKey: null }),
  resetEdit: () => set({ editItemKey: null }),
}));
