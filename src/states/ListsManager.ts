import { shouldNeverHappen } from "@/utils";

type ColumnItem = {
  id: string;
  priority: string;
  parentId: string | undefined;
};
type Column = ColumnItem;

export class ListsManager {
  columns: Column[] = [];
  itemsById: Map<string, Column> = new Map();
  childrenMap: Map<string, string[]> = new Map();

  constructor() {}

  registerColumn(id: string, priority: string) {
    if (this.itemsById.has(id)) return;

    const col = {
      id,
      priority,
      parentId: undefined,
    };
    this.columns.push(col);
    this.itemsById.set(id, col);
  }

  registerItem(parentId: string, itemId: string, priority: string) {
    if (this.itemsById.has(itemId)) return;

    const item = {
      id: itemId,
      priority,
      parentId,
    };

    const children = this.childrenMap.get(parentId) || [];
    const itemsToSort = [
      ...children.map((id) => this.itemsById.get(id)!),
      item,
    ];

    itemsToSort.sort((a, b) => {
      if (a.priority > b.priority) return 1;
      if (a.priority < b.priority) return -1;
      return 0;
    });

    this.childrenMap.set(
      parentId,
      itemsToSort.map((item) => item.id),
    );

    this.itemsById.set(itemId, item);
  }

  unregisterItemOrColumn(id: string) {
    const item = this.itemsById.get(id);
    if (!item) return;

    this.itemsById.delete(id);

    if (item.parentId === undefined) {
      const columnIndex = this.columns.findIndex((col) => col.id === id);
      if (columnIndex !== -1) {
        this.columns.splice(columnIndex, 1);
      }
    }

    if (item.parentId) {
      const siblings = this.childrenMap.get(item.parentId) || [];
      const updatedSiblings = siblings.filter((childId) => childId !== id);
      this.childrenMap.set(item.parentId, updatedSiblings);
    }
  }

  getUp(currentId: string): ColumnItem | undefined {
    const columnId = this.findColumnId(currentId);
    if (!columnId) return undefined;

    const items = this.allItems(columnId, []);

    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return undefined;

    return items[index - 1];
  }

  getDown(currentId: string): ColumnItem | undefined {
    const columnId = this.findColumnId(currentId);
    if (!columnId) return undefined;

    console.log("!!!getDown", columnId, currentId, this.allItems(columnId, []));
    const items = this.allItems(columnId, []);

    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return undefined;

    return items[index + 1];
  }

  String() {
    return printTree(this);
  }

  private findColumnId(itemId: string): string | undefined {
    const item = this.itemsById.get(itemId);
    if (!item) return undefined;
    if (item.parentId === undefined) return itemId;

    return this.findColumnId(item.parentId);
  }

  allItems(parentId: string, allItems: ColumnItem[] = []) {
    const children = this.childrenMap.get(parentId) || [];

    if (children.length == 0) {
      const item = this.itemsById.get(parentId);
      if (!item) return shouldNeverHappen("item not found", { parentId });

      allItems.push(item);
    }

    for (const childId of children) {
      const child = this.itemsById.get(childId);
      if (!child) continue;

      this.allItems(childId, allItems);
    }

    return allItems;
  }
}

function printTree(manager: {
  columns: ColumnItem[];
  itemsById: Map<string, ColumnItem>;
  childrenMap: Map<string, string[]>;
}): string {
  const output: string[] = [];

  // Print each column tree
  manager.columns.forEach((column) => {
    const children = manager.childrenMap.get(column.id) || [];
    output.push(`${column.id} (${column.priority}) ${children.length}`);

    // Print children of the column
    const childPrefix = "";
    children.forEach((childId, index) => {
      const isLastChild = index === children.length - 1;
      const childItem = manager.itemsById.get(childId);
      if (childItem) {
        output.push(
          `${childPrefix}${isLastChild ? "└── " : "├── "}${childItem.id} (${childItem.priority})`,
        );
        printNode(
          childItem,
          childPrefix + (isLastChild ? "    " : "│   "),
          output,
          manager,
        );
      }
    });
  });

  return output.join("\n");
}

function printNode(
  node: ColumnItem,
  prefix: string,
  output: string[],
  manager: {
    itemsById: Map<string, ColumnItem>;
    childrenMap: Map<string, string[]>;
  },
) {
  const children = manager.childrenMap.get(node.id) || [];

  children.forEach((childId, index) => {
    const isLastChild = index === children.length - 1;
    const childItem = manager.itemsById.get(childId);

    if (childItem) {
      output.push(
        `${prefix}${isLastChild ? "└── " : "├── "}${childItem.id} (${childItem.priority})`,
      );
      printNode(
        childItem,
        prefix + (isLastChild ? "    " : "│   "),
        isLastChild,
        output,
        manager,
      );
    }
  });
}

export const listsManager = new ListsManager();

// window.listsManager = listsManager;
