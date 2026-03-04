import { shouldNeverHappen } from "@/utils.ts";
import {
  action,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";

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

export type FocusState = {
  id: string;
  focusItemKey: FocusKey | null;
  editItemKey: FocusKey | null;
  isFocusDisabled: boolean;
};

export const focusTable = table<FocusState>("focus").withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

const FOCUS_STATE_ID = "Focus-state";

// Create the initial state
const initialFocusState: FocusState = {
  id: FOCUS_STATE_ID,
  focusItemKey: null,
  editItemKey: null,
  isFocusDisabled: false,
};

const getFocusState = selector(function* () {
  const states = yield* runQuery(
    selectFrom(focusTable, "byId")
      .where((q) => q.eq("id", FOCUS_STATE_ID))
      .limit(1),
  );

  if (states[0] === undefined) {
    yield* insert(focusTable, [initialFocusState]);
    return initialFocusState;
  }

  return states[0] as FocusState;
});

const getFocusKey = selector(function* () {
  const state = yield* getFocusState();
  return state.focusItemKey;
});

const getFocusedModelId = selector(function* () {
  const key = yield* getFocusKey();
  if (!key) return undefined as string | undefined;
  return parseColumnKey(key).id;
});

const getEditKey = selector(function* () {
  const state = yield* getFocusState();
  return state.editItemKey;
});

const isFocusDisabled = selector(function* () {
  const state = yield* getFocusState();
  return state.isFocusDisabled;
});

const isFocused = selector(function* (key: FocusKey) {
  const state = yield* getFocusState();
  if (state.isFocusDisabled) return false;
  return state.focusItemKey === key;
});

const isEditing = selector(function* (key: FocusKey) {
  const state = yield* getFocusState();
  if (state.isFocusDisabled) return false;
  return state.editItemKey === key;
});

const isSomethingEditing = selector(function* () {
  const state = yield* getFocusState();
  if (state.isFocusDisabled) return false;
  return !!state.editItemKey;
});

const isSomethingFocused = selector(function* () {
  const state = yield* getFocusState();
  if (state.isFocusDisabled) return false;
  return !!state.focusItemKey;
});

const disableFocus = action(function* () {
  const currentState = yield* getFocusState();
  const updatedState: FocusState = {
    ...currentState,
    isFocusDisabled: true,
  };
  yield* update(focusTable, [updatedState]);
});

const enableFocus = action(function* () {
  const currentState = yield* getFocusState();
  const updatedState: FocusState = {
    ...currentState,
    isFocusDisabled: false,
  };
  yield* update(focusTable, [updatedState]);
});

const focusByKey = action(function* (key: FocusKey, skipElFocus = false) {
  const currentState = yield* getFocusState();

  if (currentState.focusItemKey === key) return;

  const updatedState: FocusState = {
    ...currentState,
    focusItemKey: key,
    editItemKey: null,
  };

  yield* update(focusTable, [updatedState]);

  if (skipElFocus) return;
  console.log("focus", key);

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
});

const editByKey = action(function* (key: FocusKey) {
  const currentState = yield* getFocusState();

  if (currentState.editItemKey === key) return;

  yield* focusByKey(key, true);

  const updatedState: FocusState = {
    ...currentState,
    focusItemKey: key,
    editItemKey: key,
  };

  yield* update(focusTable, [updatedState]);
});

const resetFocus = action(function* () {
  const currentState = yield* getFocusState();
  const updatedState: FocusState = {
    ...currentState,
    focusItemKey: null,
    editItemKey: null,
  };
  yield* update(focusTable, [updatedState]);
});

const resetEdit = action(function* () {
  const currentState = yield* getFocusState();
  const updatedState: FocusState = {
    ...currentState,
    editItemKey: null,
  };
  yield* update(focusTable, [updatedState]);
});

export const focusSlice = {
  getFocusKey,
  getFocusedModelId,
  getEditKey,
  isFocusDisabled,
  isFocused,
  isEditing,
  isSomethingEditing,
  isSomethingFocused,
  disableFocus,
  enableFocus,
  focusByKey,
  editByKey,
  resetFocus,
  resetEdit,
};
