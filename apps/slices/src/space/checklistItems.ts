import { isObjectType, shouldNeverHappen } from "../utils";
import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  upsert,
  v,
} from "@will-be-done/hyperdb-lib";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { appById } from "./app";
import { AnyModelType, registerModelSlice } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";

export const checklistItemType = "checklistItem";
const taskParentType = "task";
const taskTemplateParentType = "template";
export type ChecklistParentType =
  | typeof taskParentType
  | typeof taskTemplateParentType;
export type ChecklistItemState = "todo" | "done";

export const checklistItemsTable = defineTable("checklist_items", {
  type: v.literal(checklistItemType),
  id: v.string(),
  parentId: v.string(),
  parentType: v.union(
    v.literal(taskParentType),
    v.literal(taskTemplateParentType),
  ),
  orderToken: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  content: v.string(),
  createdAt: v.number(),
  checkedAt: v.union(v.number(), v.null()),
})
  .index("byIds", ["id"])
  .index("byParentOrder", ["parentType", "parentId", "orderToken"]);
export type ChecklistItem = ExtractSchema<typeof checklistItemsTable>;

export const isChecklistItem = isObjectType<ChecklistItem>(checklistItemType);

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
registerSpaceSyncableTable(checklistItemsTable, checklistItemType);

function isChecklistParentType(
  modelType: AnyModelType,
): modelType is ChecklistParentType {
  return modelType === taskParentType || modelType === taskTemplateParentType;
}

export const checklistItemById = selector(function* checklistItemById(id: string) {
  const items = yield* selectFrom(checklistItemsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);

  return items[0] as ChecklistItem | undefined;
});

export const checklistItemByIdOrDefault = selector(function* checklistItemByIdOrDefault(id: string) {
  return (yield* checklistItemById(id)) || defaultChecklistItem;
});

export const checklistItemChildren = selector(function* checklistItemChildren(
  parentId: string,
  parentType: ChecklistParentType,
) {
  return yield* selectFrom(checklistItemsTable, "byParentOrder").where((q) =>
      q.eq("parentType", parentType).eq("parentId", parentId),
    );
});

export const checklistItemChildrenIds = selector(function* checklistItemChildrenIds(
  parentId: string,
  parentType: ChecklistParentType,
) {
  return (yield* checklistItemChildren(parentId, parentType)).map((item) => item.id);
});

export const allChecklistItems = selector(function* allChecklistItems() {
  return yield* selectFrom(checklistItemsTable, "byIds");
});

export const checklistItemSiblings = selector(function* checklistItemSiblings(
  itemId: string,
): Generator<
  unknown,
  [ChecklistItem | undefined, ChecklistItem | undefined],
  unknown
> {
  const item = yield* checklistItemById(itemId);
  if (!item) return [undefined, undefined];

  const items = yield* checklistItemChildren(item.parentId, item.parentType);
  const index = items.findIndex((child) => child.id === itemId);

  return [
    index > 0 ? items[index - 1] : undefined,
    index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
  ];
});

export const checklistItemCanDrop = selector(function* checklistItemCanDrop(
  itemId: string,
  dropId: string,
  dropModelType: AnyModelType,
) {
  if (dropModelType !== checklistItemType) return false;
  if (itemId === dropId) return false;

  const target = yield* checklistItemById(itemId);
  if (!target) return false;

  const dropped = yield* appById(dropId, dropModelType);
  return !!dropped && isChecklistItem(dropped);
});

export const createItem = action(function* createItem(
  item: Partial<ChecklistItem> & {
    parentId: string;
    parentType: ChecklistParentType;
  },
) {
  const id = item.id || uuidv7();
  const now = Date.now();

  let orderToken = item.orderToken;
  if (!orderToken) {
    const currentItems = yield* checklistItemChildren(item.parentId, item.parentType);
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

export const createItemAfter = action(function* createItemAfter(
  itemId: string,
  item?: Partial<ChecklistItem>,
) {
  const currentItem = yield* checklistItemById(itemId);
  if (!currentItem) throw new Error("Checklist item not found");

  const [, after] = yield* checklistItemSiblings(itemId);

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

export const updateItem = action(function* updateItem(
  id: string,
  item: Partial<ChecklistItem>,
) {
  const itemInState = yield* checklistItemById(id);
  if (!itemInState) throw new Error("Checklist item not found");

  yield* upsert(checklistItemsTable, [{ ...itemInState, ...item }]);
});

export const updateChecklistItemContent = action(function* updateChecklistItemContent(id: string, content: string) {
  yield* updateItem(id, { content });
});

export const toggleChecklistItemState = action(function* toggleChecklistItemState(id: string) {
  const item = yield* checklistItemById(id);
  if (!item) throw new Error("Checklist item not found");

  const state = item.state === "todo" ? "done" : "todo";
  let orderToken = item.orderToken;

  if (state === "done") {
    const items = (yield* checklistItemChildren(item.parentId, item.parentType)).filter(
      (child) => child.id !== id,
    );
    const firstDoneIndex = items.findIndex((child) => child.state === "done");

    if (firstDoneIndex === -1) {
      orderToken = generateJitteredKeyBetween(
        items[items.length - 1]?.orderToken || null,
        null,
      );
    } else {
      orderToken = generateJitteredKeyBetween(
        items[firstDoneIndex - 1]?.orderToken || null,
        items[firstDoneIndex].orderToken,
      );
    }
  }

  yield* upsert(checklistItemsTable, [
    {
      ...item,
      state,
      checkedAt: state === "done" ? Date.now() : null,
      orderToken,
    },
  ]);
});

export const deleteItems = action(function* deleteItems(ids: string[]) {
  yield* deleteRows(checklistItemsTable, ids);
});

export const deleteForParents = action(function* deleteForParents(
  parentIds: string[],
  parentType: ChecklistParentType,
) {
  const ids: string[] = [];
  for (const parentId of parentIds) {
    ids.push(...(yield* checklistItemChildrenIds(parentId, parentType)));
  }

  if (ids.length) {
    yield* deleteItems(ids);
  }
});

export const copyItems = action(function* copyItems(
  fromParentId: string,
  fromParentType: ChecklistParentType,
  toParentId: string,
  toParentType: ChecklistParentType,
) {
  const sourceItems = yield* checklistItemChildren(fromParentId, fromParentType);
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

export const moveToParent = action(function* moveToParent(
  itemId: string,
  parentId: string,
  parentType: ChecklistParentType,
  position: "append" | "prepend" = "append",
) {
  const item = yield* checklistItemById(itemId);
  if (!item) return;

  const items = (yield* checklistItemChildren(parentId, parentType)).filter(
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

export const checklistItemHandleDrop = action(function* checklistItemHandleDrop(
  itemId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
) {
  if (!(yield* checklistItemCanDrop(itemId, dropId, dropModelType))) return;

  const target = yield* checklistItemById(itemId);
  if (!target) return shouldNeverHappen("checklist target not found");

  const dropped = yield* appById(dropId, dropModelType);
  if (!dropped || !isChecklistItem(dropped)) {
    return shouldNeverHappen("checklist drop item not found");
  }

  const [before, after] = yield* checklistItemSiblings(itemId);
  const orderToken =
    edge === "top"
      ? generateJitteredKeyBetween(
          before?.orderToken || null,
          target.orderToken,
        )
      : generateJitteredKeyBetween(
          target.orderToken,
          after?.orderToken || null,
        );

  yield* updateItem(dropped.id, {
    parentId: target.parentId,
    parentType: target.parentType,
    orderToken,
  });
});

export const checklistItemCanDropOnParent = selector(function* checklistItemCanDropOnParent(
  parentId: string,
  parentType: AnyModelType,
  dropId: string,
  dropModelType: AnyModelType,
) {
  if (!isChecklistParentType(parentType)) return false;
  if (dropModelType !== checklistItemType) return false;

  const parent = yield* appById(parentId, parentType);
  const dropped = yield* appById(dropId, dropModelType);

  return !!parent && isChecklistItem(dropped);
});

export const checklistItemHandleDropOnParent = action(function* checklistItemHandleDropOnParent(
  parentId: string,
  parentType: ChecklistParentType,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
) {
  if (!(yield* checklistItemCanDropOnParent(parentId, parentType, dropId, dropModelType))) {
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
  byId: checklistItemById,
  checklistItemByIdOrDefault,
  checklistItemChildren,
  checklistItemChildrenIds,
  allChecklistItems,
  checklistItemSiblings,
  canDrop: checklistItemCanDrop,
  createItem,
  createItemAfter,
  update: updateItem,
  toggleChecklistItemState,
  delete: deleteItems,
  deleteItems,
  deleteForParents,
  copyItems,
  moveToParent,
  handleDrop: checklistItemHandleDrop,
  checklistItemCanDropOnParent,
  checklistItemHandleDropOnParent,
};

registerModelSlice(checklistItemsSlice, checklistItemsTable, checklistItemType);
