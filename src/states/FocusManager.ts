import { shouldNeverHappen } from "@/utils";
import { action, computed, makeObservable, observable } from "mobx";

const columnKey = "focus-manager-column^^focus-manager-column" as FocusKey;

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
    return this.manager.isFocused(this.key);
  }

  @computed
  get isEditing() {
    return this.manager.isEditing(this.key);
  }

  @action
  focus(skipElFocus = false) {
    this.manager.focusByKey(this.key, skipElFocus);
  }

  @action
  edit() {
    this.manager.editByKey(this.key);
  }

  get isColumn() {
    return this.parentKey === columnKey;
  }
}
type FocusColumn = FocusItem;

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

export class FocusManager {
  itemsById: Map<FocusKey, FocusItem> = new Map();
  childrenMap: Map<FocusKey, FocusItem[]> = new Map();

  @observable
  private focusItemKey: FocusKey | undefined;
  @observable
  private editItemKey: FocusKey | undefined;

  @observable
  isFocusDisabled = false;

  constructor() {
    makeObservable(this);
  }

  isFocused(key: FocusKey) {
    if (this.isFocusDisabled) return false;

    return this.focusItemKey === key;
  }

  isEditing(key: FocusKey) {
    if (this.isFocusDisabled) return false;

    return this.editItemKey === key;
  }

  @computed
  get isSomethingEditing() {
    if (this.isFocusDisabled) return false;

    return !!this.editItemKey;
  }

  @computed
  get isSomethingFocused() {
    if (this.isFocusDisabled) return false;

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
  disableFocus() {
    this.isFocusDisabled = true;
  }

  @action
  enableFocus() {
    this.isFocusDisabled = false;
  }

  @action
  focusByKey(key: FocusKey, skipElFocus = false) {
    console.log("focusByKey", key);
    if (this.focusItemKey === key) return;

    this.focusItemKey = key;
    this.editItemKey = undefined;

    if (skipElFocus) return;
    const elements = document.querySelectorAll<HTMLElement>(
      '[data-focusable-key="' + key + '"]',
    );

    if (!elements.length) {
      shouldNeverHappen("focusable element not found", { focus });
      return;
    }

    if (elements.length > 1) {
      shouldNeverHappen("focusable element > 1", { focus });
      return;
    }

    const el = elements[0];
    console.log("focus", key, el);
    if (el) {
      el.focus();

      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }

  @action
  editByKey(key: FocusKey) {
    if (this.editItemKey === key) return;
    this.focusByKey(key, true);

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

    const col = new FocusItem(this, key, columnKey, priority);
    this.registerItem(col);
  }

  buildItem(parentKey: FocusKey, itemKey: FocusKey, priority: string) {
    return new FocusItem(this, itemKey, parentKey, priority);
  }

  registerItem(item: FocusItem) {
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

(window as unknown as { focusManager: FocusManager }).focusManager =
  focusManager;
