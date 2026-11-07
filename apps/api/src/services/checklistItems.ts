import type { HyperDB } from "@will-be-done/hyperdb";
import { Clock, Effect } from "effect";
import {
  checklistItemById,
  checklistItemChildren,
  createItem,
  deleteItems,
  setChecklistItemState,
  taskById,
  taskTemplateById,
  updateItem,
  type ChecklistItem,
  type ChecklistParentType,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
import { resolveOrderToken, type Placement } from "./placement";

export interface PublicChecklistItem {
  type: "checklistItem";
  id: string;
  parentId: string;
  parentType: ChecklistParentType;
  state: "todo" | "done";
  content: string;
  createdAt: number;
  checkedAt: number | null;
}

function toPublicChecklistItem(item: ChecklistItem): PublicChecklistItem {
  return {
    type: "checklistItem",
    id: item.id,
    parentId: item.parentId,
    parentType: item.parentType,
    state: item.state,
    content: item.content,
    createdAt: item.createdAt,
    checkedAt: item.checkedAt,
  };
}

const requireParent = Effect.fnUntraced(function* (
  db: HyperDB,
  parentType: ChecklistParentType,
  parentId: string,
) {
  const parent =
    parentType === "task"
      ? yield* select(db, { selector: taskById, args: { id: parentId } })
      : yield* select(db, {
          selector: taskTemplateById,
          args: { id: parentId },
        });
  if (!parent) {
    return yield* new ResourceNotFoundError({
      resource: parentType === "task" ? "Task" : "Task template",
    });
  }
});

const requireChecklistItem = Effect.fnUntraced(function* (
  db: HyperDB,
  checklistItemId: string,
) {
  const item = yield* select(db, {
    selector: checklistItemById,
    args: { id: checklistItemId },
  });
  if (!item) {
    return yield* new ResourceNotFoundError({ resource: "Checklist item" });
  }
  return item;
});

const parentItems = (
  db: HyperDB,
  parentType: ChecklistParentType,
  parentId: string,
  excludedId?: string,
) =>
  select(db, {
    selector: checklistItemChildren,
    args: { parentType, parentId },
  }).pipe(
    Effect.map((items) => items.filter((item) => item.id !== excludedId)),
  );

export const listChecklistItems = Effect.fn("listChecklistItems")(function* ({
  spaceId,
  userId,
  parentType,
  parentId,
}: {
  spaceId: string;
  userId: string;
  parentType: ChecklistParentType;
  parentId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireParent(db, parentType, parentId);
  const items = yield* parentItems(db, parentType, parentId);
  return items.map(toPublicChecklistItem);
});

export const getChecklistItem = Effect.fn("getChecklistItem")(function* ({
  spaceId,
  userId,
  checklistItemId,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  return toPublicChecklistItem(
    yield* requireChecklistItem(db, checklistItemId),
  );
});

export const createChecklistItem = Effect.fn("createChecklistItem")(function* ({
  spaceId,
  userId,
  parentType,
  parentId,
  content,
  state = "todo",
  placement = { kind: "last" },
}: {
  spaceId: string;
  userId: string;
  parentType: ChecklistParentType;
  parentId: string;
  content: string;
  state?: "todo" | "done";
  placement?: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireParent(db, parentType, parentId);

  const item = yield* dispatch(
    db,
    createItem({
      item: {
        parentType,
        parentId,
        content,
        state,
        checkedAt: state === "done" ? yield* Clock.currentTimeMillis : null,
        orderToken: yield* resolveOrderToken({
          entities: yield* parentItems(db, parentType, parentId),
          placement,
        }),
      },
    }),
  );
  return toPublicChecklistItem(item);
});

export const updateChecklistItem = Effect.fn("updateChecklistItem")(function* ({
  spaceId,
  userId,
  checklistItemId,
  updates,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
  updates: { content?: string; state?: "todo" | "done" };
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const current = yield* requireChecklistItem(db, checklistItemId);

  if (updates.content !== undefined) {
    yield* dispatch(
      db,
      updateItem({
        id: checklistItemId,
        item: { content: updates.content },
      }),
    );
  }
  if (updates.state !== undefined && updates.state !== current.state) {
    yield* dispatch(
      db,
      setChecklistItemState({
        id: checklistItemId,
        state: updates.state,
      }),
    );
  }

  return toPublicChecklistItem(
    yield* requireChecklistItem(db, checklistItemId),
  );
});

export const moveChecklistItem = Effect.fn("moveChecklistItem")(function* ({
  spaceId,
  userId,
  checklistItemId,
  parentType,
  parentId,
  placement,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
  parentType: ChecklistParentType;
  parentId: string;
  placement: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireChecklistItem(db, checklistItemId);
  yield* requireParent(db, parentType, parentId);

  yield* dispatch(
    db,
    updateItem({
      id: checklistItemId,
      item: {
        parentType,
        parentId,
        orderToken: yield* resolveOrderToken({
          entities: yield* parentItems(
            db,
            parentType,
            parentId,
            checklistItemId,
          ),
          placement,
        }),
      },
    }),
  );
  return toPublicChecklistItem(
    yield* requireChecklistItem(db, checklistItemId),
  );
});

export const deleteChecklistItem = Effect.fn("deleteChecklistItem")(function* ({
  spaceId,
  userId,
  checklistItemId,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireChecklistItem(db, checklistItemId);
  yield* dispatch(db, deleteItems({ ids: [checklistItemId] }));
});
