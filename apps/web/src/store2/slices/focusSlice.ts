import { shouldNeverHappen } from "@/utils.ts";
import type { AnyModel } from "@will-be-done/slices";
import {
  action,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { appSlice } from "@will-be-done/slices";

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
): { type: string; id: string; component?: string } => {
  const [type, id, component] = key.split("^^");

  if (!type || !id) return shouldNeverHappen("key is not valid", { key });

  return { type, id, component };
};

const columnKey = "focus-manager-column^^focus-manager-column" as FocusKey;

type FocusItem = {
  key: FocusKey;
  parentKey: FocusKey;
  priority: string;
};

export type FocusState = {
  id: string;
  focusItemKey: FocusKey | null;
  editItemKey: FocusKey | null;
  isFocusDisabled: boolean;
};

type FocusScope = {
  itemsById: Record<string, FocusItem>;
  childrenByParentId: Record<string, string[]>;
};

export const focusTable = table<FocusState>("focus").withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

const FOCUS_STATE_ID = "focus-state";

// Create the initial state
const initialFocusState: FocusState = {
  id: FOCUS_STATE_ID,
  focusItemKey: null,
  editItemKey: null,
  isFocusDisabled: false,
};

type GenReturn<T> = Generator<unknown, T, unknown>;

const getFocusState = selector(function* (): GenReturn<FocusState> {
  const states = yield* runQuery(
    selectFrom(focusTable, "byId")
      .where((q) => q.eq("id", FOCUS_STATE_ID))
      .limit(1),
  );

  if (states[0] === undefined) {
    yield* insert(focusTable, [initialFocusState]);
    return initialFocusState;
  }

  return states[0];
});

export const focusSlice2 = {
  getFocusKey: selector(function* (): GenReturn<FocusKey | null> {
    const state = yield* getFocusState();
    return state.focusItemKey;
  }),

  getFocusedModelId: selector(function* (): GenReturn<string | undefined> {
    const key = yield* focusSlice2.getFocusKey();
    if (!key) return undefined;
    return parseColumnKey(key).id;
  }),

  getEditKey: selector(function* (): GenReturn<FocusKey | null> {
    const state = yield* getFocusState();
    return state.editItemKey;
  }),

  isFocusDisabled: selector(function* (): GenReturn<boolean> {
    const state = yield* getFocusState();
    return state.isFocusDisabled;
  }),

  isFocused: selector(function* (key: FocusKey): GenReturn<boolean> {
    const state = yield* getFocusState();
    if (state.isFocusDisabled) return false;
    return state.focusItemKey === key;
  }),

  isEditing: selector(function* (key: FocusKey): GenReturn<boolean> {
    const state = yield* getFocusState();
    if (state.isFocusDisabled) return false;
    return state.editItemKey === key;
  }),

  isSomethingEditing: selector(function* (): GenReturn<boolean> {
    const state = yield* getFocusState();
    if (state.isFocusDisabled) return false;
    return !!state.editItemKey;
  }),

  isSomethingFocused: selector(function* (): GenReturn<boolean> {
    const state = yield* getFocusState();
    if (state.isFocusDisabled) return false;
    return !!state.focusItemKey;
  }),

  disableFocus: action(function* (): GenReturn<void> {
    const currentState = yield* getFocusState();
    const updatedState: FocusState = {
      ...currentState,
      isFocusDisabled: true,
    };
    yield* update(focusTable, [updatedState]);
  }),

  enableFocus: action(function* (): GenReturn<void> {
    const currentState = yield* getFocusState();
    const updatedState: FocusState = {
      ...currentState,
      isFocusDisabled: false,
    };
    yield* update(focusTable, [updatedState]);
  }),

  focusByKey: action(function* (
    key: FocusKey,
    skipElFocus = false,
  ): GenReturn<void> {
    const currentState = yield* getFocusState();

    if (currentState.focusItemKey === key) return;

    const updatedState: FocusState = {
      ...currentState,
      focusItemKey: key,
      editItemKey: null,
    };

    yield* update(focusTable, [updatedState]);

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
  }),

  editByKey: action(function* (key: FocusKey): GenReturn<void> {
    const currentState = yield* getFocusState();

    if (currentState.editItemKey === key) return;

    yield* focusSlice2.focusByKey(key, true);

    const updatedState: FocusState = {
      ...currentState,
      focusItemKey: key,
      editItemKey: key,
    };

    yield* update(focusTable, [updatedState]);
  }),

  resetFocus: action(function* (): GenReturn<void> {
    const currentState = yield* getFocusState();
    const updatedState: FocusState = {
      ...currentState,
      focusItemKey: null,
      editItemKey: null,
    };
    yield* update(focusTable, [updatedState]);
  }),

  resetEdit: action(function* (): GenReturn<void> {
    const currentState = yield* getFocusState();
    const updatedState: FocusState = {
      ...currentState,
      editItemKey: null,
    };
    yield* update(focusTable, [updatedState]);
  }),
};

export const focusManager = (() => {
  // Don't need reactivity for this cause it will literally kill the performance
  const scope: FocusScope = {
    itemsById: {},
    childrenByParentId: {},
  };

  // Helper function to get column
  const findColumnFn = (key: FocusKey): FocusItem | undefined => {
    const item = scope.itemsById[key];
    if (!item) return undefined;
    if (item.parentKey === columnKey) return item;

    return findColumnFn(item.parentKey);
  };

  // Helper function to get all items
  const getAllItemsFn = (parentKey: FocusKey): FocusItem[] => {
    const result: FocusItem[] = [];
    const item = scope.itemsById[parentKey];
    if (!item) return result;

    const children = scope.childrenByParentId[parentKey] || [];

    if (children.length === 0 && item.parentKey !== columnKey) {
      result.push(item);
    }

    for (const childKey of children) {
      const childItems = getAllItemsFn(childKey as FocusKey);
      result.push(...childItems);
    }

    return result;
  };

  const manager = {
    getItem: (key: FocusKey) => scope.itemsById[key],
    getColumns: () => {
      const items = Object.values(scope.itemsById);
      const columns = items.filter((item) => item.parentKey === columnKey);
      return columns;
    },

    // editItem: () => {
    //   if (!state.focus.editItemKey) return undefined;
    //
    //   return scope.itemsById[state.focus.editItemKey];
    // },

    findColumn: (key: FocusKey): FocusItem | undefined => {
      return findColumnFn(key);
    },

    getChildren: (parentKey: FocusKey): FocusItem[] => {
      const childrenKeys = scope.childrenByParentId[parentKey] || [];

      return childrenKeys
        .map((key) => scope.itemsById[key])
        .filter((item): item is FocusItem => !!item);
    },

    isFocusable: (key: FocusKey): boolean => {
      const children = scope.childrenByParentId[key] || [];
      return children.length === 0;
    },

    isColumn: (key: FocusKey): boolean => {
      const item = scope.itemsById[key];
      if (!item) return false;
      return item.parentKey === columnKey;
    },

    getSiblings: (
      key: FocusKey,
    ): [FocusItem | undefined, FocusItem | undefined] => {
      const item = scope.itemsById[key];
      if (!item) return [undefined, undefined];

      if (item.parentKey === columnKey) {
        // isColumn
        const columns = manager.getChildren(item.parentKey);
        const index = columns.findIndex((col) => col.key === key);
        if (index === -1) return [undefined, undefined];
        return [columns[index - 1], columns[index + 1]];
      }

      const column = findColumnFn(key);
      if (!column) return [undefined, undefined];

      const allItems = getAllItemsFn(column.key);
      const index = allItems.findIndex((itm) => itm.key === key);
      if (index === -1) return [undefined, undefined];

      return [allItems[index - 1], allItems[index + 1]] as [
        FocusItem | undefined,
        FocusItem | undefined,
      ];
    },

    getModelSiblings: selector(function* (
      key: FocusKey,
    ): GenReturn<
      [
        [FocusItem, AnyModel] | [undefined, undefined],
        [FocusItem, AnyModel] | [undefined, undefined],
      ]
    > {
      const [up, down] = manager.getSiblings(key);

      let upModel: AnyModel | undefined = undefined;
      if (up) {
        const { id } = parseColumnKey(up.key);
        upModel = yield* appSlice.byId(id);
      }

      let downModel: AnyModel | undefined = undefined;
      if (down) {
        const { id } = parseColumnKey(down.key);
        downModel = yield* appSlice.byId(id);
      }

      return [
        up && upModel ? [up, upModel] : [undefined, undefined],
        down && downModel ? [down, downModel] : [undefined, undefined],
      ];
    }),

    getColumnSiblings: (
      key: FocusKey,
    ): [FocusItem | undefined, FocusItem | undefined] => {
      const column = findColumnFn(key);
      if (!column) return [undefined, undefined];

      return manager.getSiblings(column.key);
    },

    getSiblingColumnsFirstItem: (
      key: FocusKey,
    ): [FocusItem | undefined, FocusItem | undefined] => {
      const [left, right] = manager.getColumnSiblings(key);

      const leftItems = left ? getAllItemsFn(left.key) : [];
      const rightItems = right ? getAllItemsFn(right.key) : [];

      return [leftItems[0], rightItems[0]];
    },

    getAllItems: (parentKey: FocusKey): FocusItem[] => {
      return getAllItemsFn(parentKey);
    },

    registerColumn: (item: FocusItem) => {
      if (scope.itemsById[item.key]) return scope.itemsById[item.key];

      if (item.parentKey !== columnKey) {
        throw new Error("registerColumn only accepts column");
      }

      manager.registerItem(item);

      return item;
    },

    registerItem: (item: FocusItem) => {
      if (scope.itemsById[item.key]) return scope.itemsById[item.key]!;

      // Add to items dictionary
      scope.itemsById[item.key] = item;

      // Add to parent's children
      const children = scope.childrenByParentId[item.parentKey] || [];
      const itemsToSort = [...children, item.key];

      // Sort children by priority
      itemsToSort.sort((a, b) => {
        const itemA = scope.itemsById[a];
        const itemB = scope.itemsById[b];
        if (!itemA || !itemB) return 0;

        if (itemA.priority > itemB.priority) return 1;
        if (itemA.priority < itemB.priority) return -1;
        return 0;
      });

      scope.childrenByParentId[item.parentKey] = itemsToSort;

      return item;
    },

    unregister: (key: FocusKey) => {
      const item = scope.itemsById[key];
      if (!item) return;

      // Remove from items dictionary
      delete scope.itemsById[key];

      // Remove from parent's children
      if (item.parentKey) {
        const siblings = scope.childrenByParentId[item.parentKey] || [];
        scope.childrenByParentId[item.parentKey] = siblings.filter(
          (childKey) => childKey !== key,
        );
      }
    },

    buildItem: (
      parentKey: FocusKey,
      itemKey: FocusKey,
      priority: string,
    ): FocusItem => {
      return {
        key: itemKey,
        parentKey,
        priority,
      };
    },
    buildColumn: (key: FocusKey, priority: string): FocusItem => {
      return {
        key,
        parentKey: columnKey,
        priority,
      };
    },

    printNode(node: FocusItem, prefix: string, output: string[]) {
      const childrenKeys = scope.childrenByParentId[node.key] || [];

      childrenKeys.forEach((childKey, index) => {
        const childItem = scope.itemsById[childKey];
        if (!childItem) return;

        const isLastChild = index === childrenKeys.length - 1;

        output.push(
          `${prefix}${isLastChild ? "└── " : "├── "}${childItem.key} (${
            childItem.priority
          })`,
        );

        manager.printNode(
          childItem,
          prefix + (isLastChild ? "    " : "│   "),
          output,
        );
      });
    },
  };

  return manager;
})();

// // Create a wrapper interface to maintain backward compatibility
// export class FocusManager {
//   private state: FocusState = initialFocusState;
//
//   get itemsById() {
//     return this.state.itemsById;
//   }
//
//   get childrenMap() {
//     return this.state.childrenByParentId;
//   }
//
//   isFocused(key: FocusKey) {
//     return focusSlice.isFocused(this.state, key);
//   }
//
//   isEditing(key: FocusKey) {
//     return focusSlice.isEditing(this.state, key);
//   }
//
//   get isSomethingEditing() {
//     return focusSlice.isSomethingEditing(this.state);
//   }
//
//   get isSomethingFocused() {
//     return focusSlice.isSomethingFocused(this.state);
//   }
//
//   get focusItem() {
//     return focusSlice.focusItem(this.state);
//   }
//
//   get editItem() {
//     return focusSlice.editItem(this.state);
//   }
//
//   disableFocus() {
//     this.state = focusSlice.disableFocus(this.state);
//   }
//
//   enableFocus() {
//     this.state = focusSlice.enableFocus(this.state);
//   }
//
//   focusByKey(key: FocusKey, skipElFocus = false) {
//     this.state = focusSlice.focusByKey(this.state, key, skipElFocus);
//   }
//
//   editByKey(key: FocusKey) {
//     this.state = focusSlice.editByKey(this.state, key);
//   }
//
//   resetFocus() {
//     this.state = focusSlice.resetFocus(this.state);
//   }
//
//   resetEdit() {
//     this.state = focusSlice.resetEdit(this.state);
//   }
//
//   registerColumn(key: FocusKey, priority: string) {
//     this.state = focusSlice.registerColumn(this.state, key, priority);
//   }
//
//   buildItem(parentKey: FocusKey, itemKey: FocusKey, priority: string) {
//     return focusSlice.buildItem(this.state, parentKey, itemKey, priority);
//   }
//
//   registerItem(item: FocusItem) {
//     this.state = focusSlice.registerItem(this.state, item);
//   }
//
//   unregister(key: FocusKey) {
//     this.state = focusSlice.unregister(this.state, key);
//   }
//
//   getByKey(key: FocusKey) {
//     return focusSlice.getByKey(this.state, key);
//   }
//
//   findColumn(key: FocusKey) {
//     return focusSlice.findColumn(this.state, key);
//   }
//
//   allItems(parentKey: FocusKey, allItems: FocusItem[] = []) {
//     return focusSlice.getAllItems(this.state, parentKey);
//   }
//
//   String() {
//     return printTree(this);
//   }
// }
//
// // Helper functions for compatibility
// function printTree(manager: {
//   itemsById: Record<string, FocusItem>;
//   childrenMap: Record<string, string[]>;
// }): string {
//   const output: string[] = [];
//
//   const columnKeys = manager.childrenMap[columnKey] || [];
//   const columns = columnKeys
//     .map((key) => manager.itemsById[key])
//     .filter((col): col is FocusItem => !!col);
//
//   columns.forEach((column) => {
//     const childrenKeys = manager.childrenMap[column.key] || [];
//     output.push(`${column.key} (${column.priority}) ${childrenKeys.length}`);
//
//     // Print children of the column
//     const childPrefix = "";
//     childrenKeys.forEach((childKey, index) => {
//       const childItem = manager.itemsById[childKey];
//       if (!childItem) return;
//
//       const isLastChild = index === childrenKeys.length - 1;
//       output.push(
//         `${childPrefix}${isLastChild ? "└── " : "├── "}${childItem.key} (${
//           childItem.priority
//         })`,
//       );
//
//       printNode(
//         childItem,
//         childPrefix + (isLastChild ? "    " : "│   "),
//         output,
//         manager,
//       );
//     });
//   });
//
//   return output.join("\n");
// }

const print = () => {
  for (const column of focusManager.getColumns()) {
    console.log("column", column.key, column.priority);

    const output: string[] = [];
    focusManager.printNode(column, "", output);

    console.log(output.join("\n"));
  }
};

// @ts-expect-error it's ok
window.printFocus = print;

// // Create and export a singleton instance
// export const focusSlice = new FocusManager();
//
// // Expose the focus manager to the window for debugging
// (window as unknown as { focusSlice: FocusManager }).focusSlice =
//   focusSlice;
