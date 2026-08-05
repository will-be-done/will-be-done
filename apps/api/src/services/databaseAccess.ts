import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB, getMainHyperDB } from "../db/db";
import { getDbById, getDbByIdOrCreate } from "../slices/dbSlice";
import { getSpaceById } from "@will-be-done/slices/user";
import { userDBConfig } from "../db/configs";
import { ResourceNotFoundError } from "./errors";

export type DatabaseType = "user" | "space";

export class DatabaseAccessDeniedError extends Error {
  constructor(databaseType: DatabaseType) {
    super(`Access denied to ${databaseType}`);
    this.name = "DatabaseAccessDeniedError";
  }
}

export async function ensureDatabaseAccessOrCreate(
  {
    dbId,
    dbType,
    userId,
  }: {
    dbId: string;
    dbType: DatabaseType;
    userId: string;
  },
  mainDB?: DB,
): Promise<void> {
  if (dbType === "user") {
    if (userId !== dbId) {
      throw new DatabaseAccessDeniedError(dbType);
    }
    return;
  }

  const resolvedMainDB = mainDB ?? (await getMainHyperDB());
  const userDb = (await getHyperDB(userDBConfig(userId))).db;
  const space = await selectAsync(userDb, {
    selector: getSpaceById,
    args: { id: dbId },
  });
  if (!space) {
    throw new ResourceNotFoundError("Space");
  }

  const existing = await selectAsync(resolvedMainDB, {
    selector: getDbById,
    args: { id: dbId, type: dbType },
  });

  if (existing) {
    if (existing.userId !== userId) {
      throw new DatabaseAccessDeniedError(dbType);
    }
    return;
  }

  await asyncDispatch(
    resolvedMainDB,
    getDbByIdOrCreate({ id: dbId, type: dbType, userId }),
  );
}

export async function getSpaceDatabase(
  spaceId: string,
  userId: string,
  mainDB?: DB,
) {
  await ensureDatabaseAccessOrCreate(
    { dbId: spaceId, dbType: "space", userId },
    mainDB,
  );
  return (await getHyperDB(spaceDBConfig(spaceId))).db;
}
