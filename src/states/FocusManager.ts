import { shouldNeverHappen } from "@/utils";
import { action, computed, makeObservable, observable } from "mobx";

export class FocusItem {
  manager: FocusManager;
  key: FocusKey;
  parentKey: FocusKey | undefined;
  priority: string;

  constructor(
    manager: FocusManager,
    key: FocusKey,
    parentKey: FocusKey | undefined,
    priority: string,
  ) {
    makeObservable(this);

    this.manager = manager;
    this.key = key;
    this.parentKey = parentKey;
    this.priority = priority;
  }

  get siblings(): [FocusItem | undefined, FocusItem | undefined] {
    const column = this.manager.findColumn(this.key);
    if (!column) return [undefined, undefined];

    const items = this.manager.allItems(column.key, []);
    const index = items.findIndex((item) => item.key === this.key);
    if (index === -1) return [undefined, undefined];

    return [items[index - 1], items[index + 1]];
  }

  get isFocusable(): boolean {
    const children = this.manager.childrenMap.get(this.key) || [];
    return children.length == 0;
  }

  @computed
  get isFocused() {
    return this.manager.focusItemKey === this.key;
  }

  @computed
  get isEditing() {
    return this.manager.editItemKey === this.key;
  }

  @action
  focus() {
    this.manager.focusItemKey = this.key;
  }

  @action
  edit() {
    this.manager.editItemKey = this.key;
  }
}
type FocusColumn = FocusItem;

export type FocusKey = string & { __brand: never };
export const buildFocusKey = (id: string, type: string): FocusKey => {
  return `${type}-${id}` as FocusKey;
};

export class FocusManager {
  columns: FocusColumn[] = [];
  itemsById: Map<FocusKey, FocusItem> = new Map();
  childrenMap: Map<FocusKey, FocusItem[]> = new Map();

  @observable focusItemKey: FocusKey | undefined;
  @observable editItemKey: FocusKey | undefined;

  constructor() {
    makeObservable(this);
  }

  @computed
  get isSomethingEditing() {
    return !!this.editItemKey;
  }

  @computed
  get isSomethingFocused() {
    return !!this.focusItemKey;
  }

  @computed
  get focusItem() {
    return this.focusItemKey && this.itemsById.get(this.focusItemKey);
  }

  @computed
  get editItem() {
    return this.editItemKey && this.itemsById.get(this.editItemKey);
  }

  @action
  focusByKey(key: FocusKey) {
    if (this.focusItemKey === key) return;

    this.focusItemKey = key;
    this.editItemKey = undefined;
  }

  @action
  editByKey(key: FocusKey) {
    if (this.editItemKey === key) return;

    this.focusItemKey = key;
    this.editItemKey = key;
  }

  @action
  resetFocus() {
    this.focusItemKey = undefined;
    this.editItemKey = undefined;
  }

  @action
  resetEdit() {
    this.editItemKey = undefined;
  }

  registerColumn(key: FocusKey, priority: string) {
    if (this.itemsById.has(key)) return;

    const col = new FocusItem(this, key, undefined, priority);
    this.columns.push(col);
    this.itemsById.set(key, col);

    return col;
  }

  buildFocusItem(parentKey: FocusKey, itemKey: FocusKey, priority: string) {
    return new FocusItem(this, itemKey, parentKey, priority);
  }

  registerColumnItem(item: FocusItem) {
    if (this.itemsById.has(item.key)) return;

    if (item.parentKey === undefined) {
      throw new Error("Column item must have a parent");
    }

    const children = this.childrenMap.get(item.parentKey) || [];
    const itemsToSort = [...children, item];
    itemsToSort.sort((a, b) => {
      if (a.priority > b.priority) return 1;
      if (a.priority < b.priority) return -1;
      return 0;
    });

    this.childrenMap.set(item.parentKey, itemsToSort);
    this.itemsById.set(item.key, item);

    return item;
  }

  unregister(key: FocusKey) {
    const item = this.itemsById.get(key);
    if (!item) return;

    this.itemsById.delete(key);

    if (item.parentKey === undefined) {
      const columnIndex = this.columns.findIndex((col) => col.key === key);
      if (columnIndex !== -1) {
        this.columns.splice(columnIndex, 1);
      }
    }

    if (item.parentKey) {
      const siblings = this.childrenMap.get(item.parentKey) || [];
      const updatedSiblings = siblings.filter((child) => child.key !== key);
      this.childrenMap.set(item.parentKey, updatedSiblings);
    }
  }

  getByKey(key: FocusKey): FocusItem | undefined {
    return this.itemsById.get(key);
  }

  // String() {
  //   return printTree(this);
  // }

  findColumn(key: FocusKey): FocusItem | undefined {
    const item = this.itemsById.get(key);
    if (!item) return undefined;
    if (item.parentKey === undefined) return item;

    return this.findColumn(item.parentKey);
  }

  allItems(parentKey: FocusKey, allItems: FocusItem[] = []) {
    const children = this.childrenMap.get(parentKey) || [];

    if (children.length == 0) {
      const item = this.itemsById.get(parentKey);
      if (!item) return shouldNeverHappen("item not found", { parentKey });

      allItems.push(item);
    }

    for (const child of children) {
      this.allItems(child.key, allItems);
    }

    return allItems;
  }
}

// function printTree(manager: {
//   columns: ColumnItem[];
//   itemsById: Map<string, ColumnItem>;
//   childrenMap: Map<string, string[]>;
// }): string {
//   const output: string[] = [];
//
//   // Print each column tree
//   manager.columns.forEach((column) => {
//     const children = manager.childrenMap.get(column.id) || [];
//     output.push(`${column.id} (${column.priority}) ${children.length}`);
//
//     // Print children of the column
//     const childPrefix = "";
//     children.forEach((childId, index) => {
//       const isLastChild = index === children.length - 1;
//       const childItem = manager.itemsById.get(childId);
//       if (childItem) {
//         output.push(
//           `${childPrefix}${isLastChild ? "└── " : "├── "}${childItem.id} (${childItem.priority})`,
//         );
//         printNode(
//           childItem,
//           childPrefix + (isLastChild ? "    " : "│   "),
//           output,
//           manager,
//         );
//       }
//     });
//   });
//
//   return output.join("\n");
// }
//
// function printNode(
//   node: ColumnItem,
//   prefix: string,
//   output: string[],
//   manager: {
//     itemsById: Map<string, ColumnItem>;
//     childrenMap: Map<string, string[]>;
//   },
// ) {
//   const children = manager.childrenMap.get(node.id) || [];
//
//   children.forEach((childId, index) => {
//     const isLastChild = index === children.length - 1;
//     const childItem = manager.itemsById.get(childId);
//
//     if (childItem) {
//       output.push(
//         `${prefix}${isLastChild ? "└── " : "├── "}${childItem.id} (${childItem.priority})`,
//       );
//       printNode(
//         childItem,
//         prefix + (isLastChild ? "    " : "│   "),
//         output,
//         manager,
//       );
//     }
//   });
// }

export const focusManager = new FocusManager();

window.focusManager = focusManager;
