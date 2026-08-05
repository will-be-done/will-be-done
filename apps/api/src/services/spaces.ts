import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
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

async function getUserDatabase(userId: string) {
  return (await getHyperDB(userDBConfig(userId))).db;
}

function toPublicSpace({
  id,
  name,
  createdAt,
  updatedAt,
}: PublicSpace): PublicSpace {
  return { id, name, createdAt, updatedAt };
}

export async function listUserSpaces({
  userId,
}: {
  userId: string;
}): Promise<PublicSpace[]> {
  const spaces = await selectAsync(await getUserDatabase(userId), {
    selector: listSpaces,
    args: {},
  });

  return spaces.map(toPublicSpace);
}

export async function getUserSpace({
  userId,
  spaceId,
}: {
  userId: string;
  spaceId: string;
}): Promise<PublicSpace | null> {
  const space = await selectAsync(await getUserDatabase(userId), {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  return space ? toPublicSpace(space) : null;
}

export async function createUserSpace({
  userId,
  name,
  mainDB,
}: {
  userId: string;
  name: string;
  mainDB?: DB;
}): Promise<PublicSpace> {
  const resolvedMainDB = mainDB ?? (await getMainHyperDB());
  const userDB = await getUserDatabase(userId);
  const space = await asyncDispatch(userDB, createSpace({ name }));

  try {
    await getSpaceDatabase(space.id, userId, resolvedMainDB);
  } catch (error) {
    try {
      await asyncDispatch(userDB, deleteSpace({ id: space.id }));
    } catch (rollbackError) {
      console.error("Failed to roll back user space creation", rollbackError);
    }
    try {
      await asyncDispatch(
        resolvedMainDB,
        deleteDb({ id: space.id, type: "space" }),
      );
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

export async function deleteUserSpace({
  userId,
  spaceId,
  mainDB,
}: {
  userId: string;
  spaceId: string;
  mainDB?: DB;
}): Promise<boolean> {
  const resolvedMainDB = mainDB ?? (await getMainHyperDB());
  const userDB = await getUserDatabase(userId);
  const space = await selectAsync(userDB, {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  if (!space) return false;

  await asyncDispatch(resolvedMainDB, deleteDb({ id: spaceId, type: "space" }));
  return asyncDispatch(userDB, deleteSpace({ id: spaceId }));
}

export async function updateUserSpace({
  userId,
  spaceId,
  name,
}: {
  userId: string;
  spaceId: string;
  name: string;
}): Promise<PublicSpace | null> {
  const space = await asyncDispatch(
    await getUserDatabase(userId),
    updateSpace({ id: spaceId, name }),
  );
  return space ? toPublicSpace(space) : null;
}
