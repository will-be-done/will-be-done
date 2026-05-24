import { isObjectType, shouldNeverHappen } from "../utils";
import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { appSlice } from ".";
import { AnyModelType, registerModelSlice } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";

export const checklistItemType = "checklistItem";
const taskParentType = "task";
const taskTemplateParentType = "template";
export type ChecklistParentType =
  | typeof taskParentType
  | typeof taskTemplateParentType;
export type ChecklistItemState = "todo" | "done";

export type ChecklistItem = {
  type: typeof checklistItemType;
  id: string;
  parentId: string;
  parentType: ChecklistParentType;
  orderToken: string;
  state: ChecklistItemState;
  content: string;
  createdAt: number;
  checkedAt: number | null;
};

export const isChecklistItem =
  isObjectType<ChecklistItem>(checklistItemType);

export const defaultChecklistItem: ChecklistItem = {
  type: checklistItemType,
  id: "default-checklist-item-id",
  parentId: "default-parent-id",
  parentType: taskParentType,
  orderToken: "",
  state: "todo",
  content: "",
  createdAt: 0,
  checkedAt: null,
};

export const checklistItemsTable = table<ChecklistItem>(
  "checklist_items",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byParentOrder: {
    cols: ["parentType", "parentId", "orderToken"],
    type: "btree",
  },
});
registerSpaceSyncableTable(checklistItemsTable, checklistItemType);

function isChecklistParentType(
  modelType: AnyModelType,
): modelType is ChecklistParentType {
  return modelType === taskParentType || modelType === taskTemplateParentType;
}

export const byId = selector(function* (id: string) {
  const items = yield* runQuery(
    selectFrom(checklistItemsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );

  return items[0] as ChecklistItem | undefined;
});

export const byIdOrDefault = selector(function* (id: string) {
  return (yield* byId(id)) || defaultChecklistItem;
});

export const children = selector(function* (
  parentId: string,
  parentType: ChecklistParentType,
) {
  return yield* runQuery(
    selectFrom(checklistItemsTable, "byParentOrder").where((q) =>
      q.eq("parentType", parentType).eq("parentId", parentId),
    ),
  );
});

export const childrenIds = selector(function* (
  parentId: string,
  parentType: ChecklistParentType,
) {
  return (yield* children(parentId, parentType)).map((item) => item.id);
});

export const all = selector(function* () {
  return yield* runQuery(selectFrom(checklistItemsTable, "byIds"));
});

export const siblings = selector(function* (
  itemId: string,
): Generator<
  unknown,
  [ChecklistItem | undefined, ChecklistItem | undefined],
  unknown
> {
  const item = yield* byId(itemId);
  if (!item) return [undefined, undefined];

  const items = yield* children(item.parentId, item.parentType);
  const index = items.findIndex((child) => child.id === itemId);

  return [
    index > 0 ? items[index - 1] : undefined,
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
  ];
});

export const canDrop = selector(function* (
  itemId: string,
  dropId: string,
  dropModelType: AnyModelType,
) {
  if (dropModelType !== checklistItemType) return false;
  if (itemId === dropId) return false;

  const target = yield* byId(itemId);
  if (!target) return false;

  const dropped = yield* appSlice.byId(dropId, dropModelType);
  return !!dropped && isChecklistItem(dropped);
});

export const createItem = action(function* (
  item: Partial<ChecklistItem> & {
    parentId: string;
    parentType: ChecklistParentType;
  },
) {
  const id = item.id || uuidv7();
  const now = Date.now();

  let orderToken = item.orderToken;
  if (!orderToken) {
    const currentItems = yield* children(item.parentId, item.parentType);
    orderToken = generateJitteredKeyBetween(
      currentItems[currentItems.length - 1]?.orderToken || null,
      null,
    );
  }

  const newItem: ChecklistItem = {
    type: checklistItemType,
    id,
    state: "todo",
    content: "",
    createdAt: now,
    checkedAt: null,
    ...item,
    parentId: item.parentId,
    parentType: item.parentType,
    orderToken,
  };

  yield* insert(checklistItemsTable, [newItem]);
  return newItem;
});

export const createItemAfter = action(function* (
  itemId: string,
  item?: Partial<ChecklistItem>,
) {
  const currentItem = yield* byId(itemId);
  if (!currentItem) throw new Error("Checklist item not found");

  const [, after] = yield* siblings(itemId);

  return yield* createItem({
    ...item,
    parentId: currentItem.parentId,
    parentType: currentItem.parentType,
    orderToken: generateJitteredKeyBetween(
      currentItem.orderToken,
      after?.orderToken || null,
    ),
  });
});

export const updateItem = action(function* (
  id: string,
  item: Partial<ChecklistItem>,
) {
  const itemInState = yield* byId(id);
  if (!itemInState) throw new Error("Checklist item not found");

  yield* update(checklistItemsTable, [{ ...itemInState, ...item }]);
});

export const toggleState = action(function* (id: string) {
  const item = yield* byId(id);
  if (!item) throw new Error("Checklist item not found");

  const state = item.state === "todo" ? "done" : "todo";
  yield* update(checklistItemsTable, [
    {
      ...item,
      state,
      checkedAt: state === "done" ? Date.now() : null,
    },
  ]);
});

export const deleteItems = action(function* (ids: string[]) {
  yield* deleteRows(checklistItemsTable, ids);
});

export const deleteForParents = action(function* (
  parentIds: string[],
  parentType: ChecklistParentType,
) {
  const ids: string[] = [];
  for (const parentId of parentIds) {
    ids.push(...(yield* childrenIds(parentId, parentType)));
  }

  if (ids.length) {
    yield* deleteItems(ids);
  }
});

export const copyItems = action(function* (
  fromParentId: string,
  fromParentType: ChecklistParentType,
  toParentId: string,
  toParentType: ChecklistParentType,
) {
  const sourceItems = yield* children(fromParentId, fromParentType);
  const now = Date.now();
  const copiedItems = sourceItems.map((item) => ({
    ...item,
    id: uuidv7(),
    parentId: toParentId,
    parentType: toParentType,
    state: "todo" as const,
    createdAt: now,
    checkedAt: null,
  }));

  if (copiedItems.length) {
    yield* insert(checklistItemsTable, copiedItems);
  }

  return copiedItems;
});

export const moveToParent = action(function* (
  itemId: string,
  parentId: string,
  parentType: ChecklistParentType,
  position: "append" | "prepend" = "append",
) {
  const item = yield* byId(itemId);
  if (!item) return;

  const items = (yield* children(parentId, parentType)).filter(
    (child) => child.id !== itemId,
  );
  const orderToken =
    position === "prepend"
      ? generateJitteredKeyBetween(null, items[0]?.orderToken || null)
      : generateJitteredKeyBetween(
          items[items.length - 1]?.orderToken || null,
          null,
        );

  yield* updateItem(itemId, { parentId, parentType, orderToken });
});

export const handleDrop = action(function* (
  itemId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
) {
  if (!(yield* canDrop(itemId, dropId, dropModelType))) return;

  const target = yield* byId(itemId);
  if (!target) return shouldNeverHappen("checklist target not found");

  const dropped = yield* appSlice.byId(dropId, dropModelType);
  if (!dropped || !isChecklistItem(dropped)) {
    return shouldNeverHappen("checklist drop item not found");
  }

  const [before, after] = yield* siblings(itemId);
  const orderToken =
    edge === "top"
      ? generateJitteredKeyBetween(before?.orderToken || null, target.orderToken)
      : generateJitteredKeyBetween(target.orderToken, after?.orderToken || null);

  yield* updateItem(dropped.id, {
    parentId: target.parentId,
    parentType: target.parentType,
    orderToken,
  });
});

export const canDropOnParent = selector(function* (
  parentId: string,
  parentType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
) {
  if (!isChecklistParentType(parentType)) return false;
  if (dropModelType !== checklistItemType) return false;

  const parent = yield* appSlice.byId(parentId, parentType);
  const dropped = yield* appSlice.byId(dropId, dropModelType);

  return !!parent && isChecklistItem(dropped);
});

export const handleDropOnParent = action(function* (
  parentId: string,
  parentType: ChecklistParentType,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
) {
  if (!(yield* canDropOnParent(parentId, parentType, dropId, dropModelType))) {
    return;
  }

  yield* moveToParent(
    dropId,
    parentId,
    parentType,
    edge === "top" ? "prepend" : "append",
  );
});

const checklistItemsSlice = {
  byId,
  byIdOrDefault,
  children,
  childrenIds,
  all,
  siblings,
  canDrop,
  createItem,
  createItemAfter,
  update: updateItem,
  toggleState,
  delete: deleteItems,
  deleteItems,
  deleteForParents,
  copyItems,
  moveToParent,
  handleDrop,
  canDropOnParent,
  handleDropOnParent,
};

registerModelSlice(checklistItemsSlice, checklistItemsTable, checklistItemType);
