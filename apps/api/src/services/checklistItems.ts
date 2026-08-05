import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
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

async function requireParent(
  db: Awaited<ReturnType<typeof getSpaceDatabase>>,
  parentType: ChecklistParentType,
  parentId: string,
) {
  const parent =
    parentType === "task"
      ? await selectAsync(db, { selector: taskById, args: { id: parentId } })
      : await selectAsync(db, {
          selector: taskTemplateById,
          args: { id: parentId },
        });
  if (!parent) {
    throw new ResourceNotFoundError(
      parentType === "task" ? "Task" : "Task template",
    );
  }
}

async function parentItems(
  db: Awaited<ReturnType<typeof getSpaceDatabase>>,
  parentType: ChecklistParentType,
  parentId: string,
  excludedId?: string,
) {
  return (
    await selectAsync(db, {
      selector: checklistItemChildren,
      args: { parentType, parentId },
    })
  ).filter((item) => item.id !== excludedId);
}

export async function listChecklistItems({
  spaceId,
  userId,
  parentType,
  parentId,
}: {
  spaceId: string;
  userId: string;
  parentType: ChecklistParentType;
  parentId: string;
}): Promise<PublicChecklistItem[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireParent(db, parentType, parentId);
  return (await parentItems(db, parentType, parentId)).map(
    toPublicChecklistItem,
  );
}

export async function getChecklistItem({
  spaceId,
  userId,
  checklistItemId,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
}): Promise<PublicChecklistItem> {
  const db = await getSpaceDatabase(spaceId, userId);
  const item = await selectAsync(db, {
    selector: checklistItemById,
    args: { id: checklistItemId },
  });
  if (!item) throw new ResourceNotFoundError("Checklist item");
  return toPublicChecklistItem(item);
}

export async function createChecklistItem({
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
}): Promise<PublicChecklistItem> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireParent(db, parentType, parentId);

  const item = await asyncDispatch(
    db,
    createItem({
      item: {
        parentType,
        parentId,
        content,
        state,
        checkedAt: state === "done" ? Date.now() : null,
        orderToken: resolveOrderToken({
          entities: await parentItems(db, parentType, parentId),
          placement,
        }),
      },
    }),
  );
  return toPublicChecklistItem(item);
}

export async function updateChecklistItem({
  spaceId,
  userId,
  checklistItemId,
  updates,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
  updates: { content?: string; state?: "todo" | "done" };
}): Promise<PublicChecklistItem> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: checklistItemById,
    args: { id: checklistItemId },
  });
  if (!current) throw new ResourceNotFoundError("Checklist item");

  if (updates.content !== undefined) {
    await asyncDispatch(
      db,
      updateItem({
        id: checklistItemId,
        item: { content: updates.content },
      }),
    );
  }
  if (updates.state !== undefined && updates.state !== current.state) {
    await asyncDispatch(
      db,
      setChecklistItemState({
        id: checklistItemId,
        state: updates.state,
      }),
    );
  }

  return getChecklistItem({ spaceId, userId, checklistItemId });
}

export async function moveChecklistItem({
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
}): Promise<PublicChecklistItem> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: checklistItemById,
    args: { id: checklistItemId },
  });
  if (!current) throw new ResourceNotFoundError("Checklist item");
  await requireParent(db, parentType, parentId);

  await asyncDispatch(
    db,
    updateItem({
      id: checklistItemId,
      item: {
        parentType,
        parentId,
        orderToken: resolveOrderToken({
          entities: await parentItems(
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
  return getChecklistItem({ spaceId, userId, checklistItemId });
}

export async function deleteChecklistItem({
  spaceId,
  userId,
  checklistItemId,
}: {
  spaceId: string;
  userId: string;
  checklistItemId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const item = await selectAsync(db, {
    selector: checklistItemById,
    args: { id: checklistItemId },
  });
  if (!item) throw new ResourceNotFoundError("Checklist item");
  await asyncDispatch(db, deleteItems({ ids: [checklistItemId] }));
}
