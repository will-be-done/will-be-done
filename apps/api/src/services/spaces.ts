import { selectSync, syncDispatch, type DB } from "@will-be-done/hyperdb";
import {
  createSpace,
  deleteSpace,
  getSpaceById,
  listSpaces,
  updateSpace,
} from "@will-be-done/slices/user";
import { userDBConfig } from "../db/configs";
import { getHyperDB, getMainHyperDB } from "../db/db";
import { deleteDb } from "../slices/dbSlice";
import { getSpaceDatabase } from "./databaseAccess";

export interface PublicSpace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function getUserDatabase(userId: string) {
  return getHyperDB(userDBConfig(userId)).db;
}

function toPublicSpace({
  id,
  name,
  createdAt,
  updatedAt,
}: PublicSpace): PublicSpace {
  return { id, name, createdAt, updatedAt };
}

export function listUserSpaces({ userId }: { userId: string }): PublicSpace[] {
  const spaces = selectSync(getUserDatabase(userId), {
    selector: listSpaces,
    args: {},
  });

  return spaces.map(toPublicSpace);
}

export function getUserSpace({
  userId,
  spaceId,
}: {
  userId: string;
  spaceId: string;
}): PublicSpace | null {
  const space = selectSync(getUserDatabase(userId), {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  return space ? toPublicSpace(space) : null;
}

export function createUserSpace({
  userId,
  name,
  mainDB = getMainHyperDB(),
}: {
  userId: string;
  name: string;
  mainDB?: DB;
}): PublicSpace {
  const space = syncDispatch(getUserDatabase(userId), createSpace({ name }));

  try {
    getSpaceDatabase(space.id, userId, mainDB);
  } catch (error) {
    try {
      syncDispatch(getUserDatabase(userId), deleteSpace({ id: space.id }));
    } catch (rollbackError) {
      console.error("Failed to roll back user space creation", rollbackError);
    }
    try {
      syncDispatch(mainDB, deleteDb({ id: space.id, type: "space" }));
    } catch (rollbackError) {
      console.error(
        "Failed to roll back space database registration",
        rollbackError,
      );
    }
    throw error;
  }

  return toPublicSpace(space);
}

export function deleteUserSpace({
  userId,
  spaceId,
  mainDB = getMainHyperDB(),
}: {
  userId: string;
  spaceId: string;
  mainDB?: DB;
}): boolean {
  const userDB = getUserDatabase(userId);
  const space = selectSync(userDB, {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  if (!space) return false;

  syncDispatch(mainDB, deleteDb({ id: spaceId, type: "space" }));
  return syncDispatch(userDB, deleteSpace({ id: spaceId }));
}

export function updateUserSpace({
  userId,
  spaceId,
  name,
}: {
  userId: string;
  spaceId: string;
  name: string;
}): PublicSpace | null {
  const space = syncDispatch(
    getUserDatabase(userId),
    updateSpace({ id: spaceId, name }),
  );
  return space ? toPublicSpace(space) : null;
}
