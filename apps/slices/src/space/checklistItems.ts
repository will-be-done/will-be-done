import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { appById, appCanDrop } from "./app";
import { registerModelSlice } from "./maps";
import {
  ChecklistItem,
  checklistItemType,
  checklistItemsTable,
  checklistParentType,
  isChecklistItem,
  isChecklistParentType,
  possibleModelType,
  taskType,
} from "./tables";

export const defaultChecklistItem: ChecklistItem = {
  type: checklistItemType,
  id: "default-checklist-item-id",
  parentId: "default-parent-id",
  parentType: taskType,
  orderToken: "",
  state: "todo",
  content: "",
  createdAt: 0,
  checkedAt: null,
};

export const hasChecklistItems = selector({
  name: "hasChecklistItem",
  args: {
    parentType: checklistParentType,
    parentId: v.string(),
  },
  handler: function* hasChecklistItem({ parentType, parentId }) {
    return (
      (yield* selectFrom(checklistItemsTable, "byParentOrder")
        .where((q) => q.eq("parentId", parentId).eq("parentType", parentType))
        .first()) !== undefined
    );
  },
});

export const checklistItemById = selector({
  name: "checklistItemById",
  args: { id: v.string() },
  handler: function* checklistItemById({ id }) {
    const items = yield* selectFrom(checklistItemsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);

    return items[0] as ChecklistItem | undefined;
  },
});

export const checklistItemByIdOrDefault = selector({
  name: "checklistItemByIdOrDefault",
  args: { id: v.string() },
  handler: function* checklistItemByIdOrDefault({ id }) {
    return (yield* checklistItemById({ id })) || defaultChecklistItem;
  },
});

export const checklistItemChildren = selector({
  name: "checklistItemChildren",
  args: {
    parentId: v.string(),
    parentType: checklistParentType,
  },
  handler: function* checklistItemChildren({ parentId, parentType }) {
    return yield* selectFrom(checklistItemsTable, "byParentOrder").where((q) =>
      q.eq("parentType", parentType).eq("parentId", parentId),
    );
  },
});

export const checklistItemChildrenIds = selector({
  name: "checklistItemChildrenIds",
  args: {
    parentId: v.string(),
    parentType: checklistParentType,
  },
  handler: function* checklistItemChildrenIds({ parentId, parentType }) {
    return (yield* checklistItemChildren({
      parentId,
      parentType,
    })).map((item) => item.id);
  },
});

export const allChecklistItems = selector({
  name: "allChecklistItems",
  args: {},
  handler: function* allChecklistItems() {
    return yield* selectFrom(checklistItemsTable, "byIds");
  },
});

export const checklistItemSiblings = selector({
  name: "checklistItemSiblings",
  args: { itemId: v.string() },
  handler: function* checklistItemSiblings({
    itemId,
  }): Generator<
    unknown,
    [ChecklistItem | undefined, ChecklistItem | undefined],
    unknown
  > {
    const item = yield* checklistItemById({ id: itemId });
    if (!item) return [undefined, undefined];

    const items = yield* checklistItemChildren({
      parentId: item.parentId,
      parentType: item.parentType,
    });
    const index = items.findIndex((child) => child.id === itemId);

    return [
      index > 0 ? items[index - 1] : undefined,
      index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
    ];
  },
});

export const checklistItemCanDrop = selector({
  name: "checklistItemCanDrop",
  args: {
    itemId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* checklistItemCanDrop({ itemId, dropId, dropModelType }) {
    return yield* appCanDrop({
      id: itemId,
      modelType: checklistItemType,
      dropId,
      dropModelType,
    });
  },
});

export const createItem = action({
  name: "createItem",
  args: {
    item: v.required(v.partial(checklistItemsTable.v()), [
      "parentId",
      "parentType",
    ]),
  },
  handler: function* createItem({ item }) {
    const id = item.id || uuidv7();
    const now = Date.now();

    let orderToken = item.orderToken;
    if (!orderToken) {
      const currentItems = yield* checklistItemChildren({
        parentId: item.parentId,
        parentType: item.parentType,
      });
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
  },
});

export const createItemAfter = action({
  name: "createItemAfter",
  args: {
    itemId: v.string(),
    item: v.optional(v.partial(checklistItemsTable.v())),
  },
  handler: function* createItemAfter({ itemId, item }) {
    const currentItem = yield* checklistItemById({ id: itemId });
    if (!currentItem) throw new Error("Checklist item not found");

    const [, after] = yield* checklistItemSiblings({ itemId });

    return yield* createItem({
      item: {
        ...item,
        parentId: currentItem.parentId,
        parentType: currentItem.parentType,
        orderToken: generateJitteredKeyBetween(
          currentItem.orderToken,
          after?.orderToken || null,
        ),
      },
    });
  },
});

export const updateItem = action({
  name: "updateItem",
  args: {
    id: v.string(),
    item: v.partial(checklistItemsTable.v()),
  },
  handler: function* updateItem({ id, item }) {
    const itemInState = yield* checklistItemById({ id });
    if (!itemInState) throw new Error("Checklist item not found");

    yield* upsert(checklistItemsTable, [{ ...itemInState, ...item }]);
  },
});

export const updateChecklistItemContent = action({
  name: "updateChecklistItemContent",
  args: {
    id: v.string(),
    content: v.string(),
  },
  handler: function* updateChecklistItemContent({ id, content }) {
    yield* updateItem({
      id,
      item: { content },
    });
  },
});

export const setChecklistItemState = action({
  name: "setChecklistItemState",
  args: {
    id: v.string(),
    state: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: function* setChecklistItemState({ id, state }) {
    const item = yield* checklistItemById({ id });
    if (!item) throw new Error("Checklist item not found");
    if (item.state === state) return;

    let orderToken = item.orderToken;

    if (state === "done") {
      const items = (yield* checklistItemChildren({
        parentId: item.parentId,
        parentType: item.parentType,
      })).filter((child) => child.id !== id);
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
  },
});

export const toggleChecklistItemState = action({
  name: "toggleChecklistItemState",
  args: { id: v.string() },
  handler: function* toggleChecklistItemState({ id }) {
    const item = yield* checklistItemById({ id });
    if (!item) throw new Error("Checklist item not found");

    yield* setChecklistItemState({
      id,
      state: item.state === "todo" ? "done" : "todo",
    });
  },
});

export const deleteItems = action({
  name: "deleteItems",
  args: { ids: v.array(v.string()) },
  handler: function* deleteItems({ ids }) {
    yield* deleteRows(checklistItemsTable, ids);
  },
});

export const deleteForParents = action({
  name: "deleteForParents",
  args: {
    parentIds: v.array(v.string()),
    parentType: checklistParentType,
  },
  handler: function* deleteForParents({ parentIds, parentType }) {
    const ids: string[] = [];
    for (const parentId of parentIds) {
      ids.push(
        ...(yield* checklistItemChildrenIds({
          parentId,
          parentType,
        })),
      );
    }

    if (ids.length) {
      yield* deleteItems({ ids });
    }
  },
});

export const copyItems = action({
  name: "copyItems",
  args: {
    fromParentId: v.string(),
    fromParentType: checklistParentType,
    toParentId: v.string(),
    toParentType: checklistParentType,
  },
  handler: function* copyItems({
    fromParentId,
    fromParentType,
    toParentId,
    toParentType,
  }) {
    const sourceItems = yield* checklistItemChildren({
      parentId: fromParentId,
      parentType: fromParentType,
    });
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
  },
});

export const moveToParent = action({
  name: "moveToParent",
  args: {
    itemId: v.string(),
    parentId: v.string(),
    parentType: checklistParentType,
    position: v.union(v.literal("append"), v.literal("prepend")),
  },
  handler: function* moveToParent({ itemId, parentId, parentType, position }) {
    const item = yield* checklistItemById({ id: itemId });
    if (!item) return;

    const items = (yield* checklistItemChildren({
      parentId,
      parentType,
    })).filter((child) => child.id !== itemId);
    const orderToken =
      position === "prepend"
        ? generateJitteredKeyBetween(null, items[0]?.orderToken || null)
        : generateJitteredKeyBetween(
            items[items.length - 1]?.orderToken || null,
            null,
          );

    yield* updateItem({
      id: itemId,
      item: { parentId, parentType, orderToken },
    });
  },
});

export const checklistItemHandleDrop = action({
  name: "checklistItemHandleDrop",
  args: {
    itemId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* checklistItemHandleDrop({
    itemId,
    dropId,
    dropModelType,
    edge,
  }) {
    if (
      !(yield* checklistItemCanDrop({
        itemId,
        dropId,
        dropModelType,
      }))
    )
      return;

    const target = yield* checklistItemById({ id: itemId });
    if (!target) return shouldNeverHappen("checklist target not found");

    const dropped = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!dropped || !isChecklistItem(dropped)) {
      return shouldNeverHappen("checklist drop item not found");
    }

    const [before, after] = yield* checklistItemSiblings({ itemId });
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

    yield* updateItem({
      id: dropped.id,
      item: {
        parentId: target.parentId,
        parentType: target.parentType,
        orderToken,
      },
    });
  },
});

export const checklistItemCanDropOnParent = selector({
  name: "checklistItemCanDropOnParent",
  args: {
    parentId: v.string(),
    parentType: checklistParentType,
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* checklistItemCanDropOnParent({
    parentId,
    parentType,
    dropId,
    dropModelType,
  }) {
    if (!isChecklistParentType(parentType)) return false;
    if (dropModelType !== checklistItemType) return false;

    const parent = yield* appById({
      id: parentId,
      modelType: parentType,
    });
    const dropped = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });

    return !!parent && isChecklistItem(dropped);
  },
});

export const checklistItemHandleDropOnParent = action({
  name: "checklistItemHandleDropOnParent",
  args: {
    parentId: v.string(),
    parentType: checklistParentType,
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* checklistItemHandleDropOnParent({
    parentId,
    parentType,
    dropId,
    dropModelType,
    edge,
  }) {
    if (
      !(yield* checklistItemCanDropOnParent({
        parentId,
        parentType,
        dropId,
        dropModelType,
      }))
    ) {
      return;
    }

    yield* moveToParent({
      itemId: dropId,
      parentId,
      parentType,
      position: edge === "top" ? "prepend" : "append",
    });
  },
});

const checklistItemsSlice = {
  byId: checklistItemById,
  delete: deleteItems,
  canDrop: checklistItemCanDrop,
  handleDrop: checklistItemHandleDrop,
};

registerModelSlice(checklistItemsSlice, checklistItemsTable, checklistItemType);
