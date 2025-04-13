import { shouldNeverHappen } from "@/utils";
import { action, computed, makeObservable, observable } from "mobx";

const columnKey = "focus-manager-column-focus-manager-column";

export class FocusItem {
  manager: FocusManager;
  key: FocusKey;
  parentKey: FocusKey;
  priority: string;

  constructor(
    manager: FocusManager,
    key: FocusKey,
    parentKey: FocusKey,
    priority: string,
  ) {
    makeObservable(this);

    this.manager = manager;
    this.key = key;
    this.parentKey = parentKey;
    this.priority = priority;
  }

  get siblings(): [FocusItem | undefined, FocusItem | undefined] {
    if (this.isColumn) {
      const columns = this.manager.childrenMap.get(this.parentKey) || [];
      const index = columns.findIndex((item) => item.key === this.key);

      if (index === -1)
        return shouldNeverHappen("column not found", { t: this });

      return [columns[index - 1], columns[index + 1]];
    }

    const column = this.manager.findColumn(this.key);
    if (!column) return shouldNeverHappen("column not found", { t: this });

    const allItems = column.flatChildren;
    const index = allItems.findIndex((item) => item.key === this.key);
    if (index === -1) return shouldNeverHappen("item not found", { t: this });

    return [allItems[index - 1], allItems[index + 1]];
  }

  get isFocusable(): boolean {
    const children = this.manager.childrenMap.get(this.key) || [];
    return children.length == 0;
  }

  get flatChildren(): FocusItem[] {
    return this.manager.allItems(this.key, []);
  }

  get columnSiblings(): [FocusItem | undefined, FocusItem | undefined] {
    const column = this.manager.findColumn(this.key);
    if (!column) return shouldNeverHappen("column not found", { t: this });

    return column.siblings;
  }

  get siblingColumnsFirstItem(): [
    FocusItem | undefined,
    FocusItem | undefined,
  ] {
    const [left, right] = this.columnSiblings;

    return [left?.flatChildren[0], right?.flatChildren[0]];
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

  get isColumn() {
    return this.parentKey === "focus-manager-column-focus-manager-column";
  }
}
type FocusColumn = FocusItem;

export type FocusKey = string & { __brand: never };
export const buildFocusKey = (
  id: string,
  type: string,
  component?: string,
): FocusKey => {
  return `${type}-${id}${component ? `-${component}` : ""}` as FocusKey;
};

export class FocusManager {
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

    const col = new FocusItem(
      this,
      key,
      buildFocusKey("focus-manager-column", "focus-manager-column"),
      priority,
    );

    this.registerColumnItem(col);

    return col;
  }

  buildFocusItem(parentKey: FocusKey, itemKey: FocusKey, priority: string) {
    return new FocusItem(this, itemKey, parentKey, priority);
  }

  registerColumnItem(item: FocusItem) {
    if (this.itemsById.has(item.key)) return;

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

    if (item.parentKey) {
      const siblings = this.childrenMap.get(item.parentKey) || [];
      const updatedSiblings = siblings.filter((child) => child.key !== key);
      this.childrenMap.set(item.parentKey, updatedSiblings);
    }
  }

  getByKey(key: FocusKey): FocusItem | undefined {
    return this.itemsById.get(key);
  }

  String() {
    return printTree(this);
  }

  findColumn(key: FocusKey): FocusItem | undefined {
    const item = this.itemsById.get(key);
    if (!item) return undefined;
    if (item.isColumn) return item;

    return this.findColumn(item.parentKey);
  }

  allItems(parentKey: FocusKey, allItems: FocusItem[] = []) {
    const item = this.itemsById.get(parentKey);
    if (!item) return shouldNeverHappen("item not found", { parentKey });

    const children = this.childrenMap.get(parentKey) || [];

    if (children.length == 0 && !item.isColumn) {
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

function printTree(manager: {
  itemsById: Map<string, FocusItem>;
  childrenMap: Map<string, FocusItem[]>;
}): string {
  const output: string[] = [];

  const columns =
    manager.childrenMap.get("focus-manager-column-focus-manager-column") || [];
  columns.forEach((column) => {
    const children = manager.childrenMap.get(column.key) || [];
    output.push(`${column.key} (${column.priority}) ${children.length}`);

    // Print children of the column
    const childPrefix = "";
    children.forEach((childItem, index) => {
      const isLastChild = index === children.length - 1;
      output.push(
        `${childPrefix}${isLastChild ? "└── " : "├── "}${childItem.key} (${childItem.priority})`,
      );

      printNode(
        childItem,
        childPrefix + (isLastChild ? "    " : "│   "),
        output,
        manager,
      );
    });
  });

  return output.join("\n");
}

function printNode(
  node: FocusColumn,
  prefix: string,
  output: string[],
  manager: {
    itemsById: Map<string, FocusColumn>;
    childrenMap: Map<string, FocusItem[]>;
  },
) {
  const children = manager.childrenMap.get(node.key) || [];

  children.forEach((childItem, index) => {
    const isLastChild = index === children.length - 1;

    if (childItem) {
      output.push(
        `${prefix}${isLastChild ? "└── " : "├── "}${childItem.key} (${childItem.priority})`,
      );
      printNode(
        childItem,
        prefix + (isLastChild ? "    " : "│   "),
        output,
        manager,
      );
    }
  });
}

export const focusManager = new FocusManager();

window.focusManager = focusManager;
