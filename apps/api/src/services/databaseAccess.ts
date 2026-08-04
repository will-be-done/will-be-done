import { selectSync, syncDispatch, type DB } from "@will-be-done/hyperdb";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB, getMainHyperDB } from "../db/db";
import { getDbById, getDbByIdOrCreate } from "../slices/dbSlice";
import { getSpaceById } from "@will-be-done/slices/user";
import { userDBConfig } from "../db/configs";
import { generateTasksFromTemplates } from "@will-be-done/slices/space";
import { ResourceNotFoundError } from "./errors";
import { getEnvConfig } from "../env";

export type DatabaseType = "user" | "space";

export class DatabaseAccessDeniedError extends Error {
  constructor(databaseType: DatabaseType) {
    super(`Access denied to ${databaseType}`);
    this.name = "DatabaseAccessDeniedError";
  }
}

export function ensureDatabaseAccessOrCreate(
  {
    dbId,
    dbType,
    userId,
  }: {
    dbId: string;
    dbType: DatabaseType;
    userId: string;
  },
  mainDB: DB = getMainHyperDB(),
): void {
  if (dbType === "user") {
    if (userId !== dbId) {
      throw new DatabaseAccessDeniedError(dbType);
    }
    return;
  }

  const userDb = getHyperDB(userDBConfig(userId)).db;
  const space = selectSync(userDb, {
    selector: getSpaceById,
    args: { id: dbId },
  });
  if (!space) {
    throw new ResourceNotFoundError("Space");
  }

  const existing = selectSync(mainDB, {
    selector: getDbById,
    args: { id: dbId, type: dbType },
  });

  if (existing) {
    if (existing.userId !== userId) {
      throw new DatabaseAccessDeniedError(dbType);
    }
    return;
  }

  syncDispatch(mainDB, getDbByIdOrCreate({ id: dbId, type: dbType, userId }));
}

export function getSpaceDatabase(
  spaceId: string,
  userId: string,
  mainDB: DB = getMainHyperDB(),
) {
  ensureDatabaseAccessOrCreate(
    { dbId: spaceId, dbType: "space", userId },
    mainDB,
  );
  return getHyperDB(spaceDBConfig(spaceId)).db;
}

const lastTaskGenerationBySpace = new Map<string, number>();

export function generateSpaceTasksIfDue({
  spaceId,
  userId,
  force = false,
  now = Date.now(),
  mainDB = getMainHyperDB(),
}: {
  spaceId: string;
  userId: string;
  force?: boolean;
  now?: number;
  mainDB?: DB;
}): void {
  const db = getSpaceDatabase(spaceId, userId, mainDB);
  const lastGeneratedAt = lastTaskGenerationBySpace.get(spaceId) ?? 0;
  if (
    !force &&
    now - lastGeneratedAt < getEnvConfig().WBD_TASK_GENERATION_INTERVAL_MS
  ) {
    return;
  }

  lastTaskGenerationBySpace.set(spaceId, now);
  try {
    syncDispatch(db, generateTasksFromTemplates({ toDate: now }));
  } catch (error) {
    console.error(
      `Failed to generate recurring tasks for space ${spaceId}`,
      error,
    );
  }
}

export function forgetSpaceAccessState(spaceId: string): void {
  lastTaskGenerationBySpace.delete(spaceId);
}
