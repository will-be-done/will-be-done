import { Effect } from "effect";
import { getSpaceById } from "@will-be-done/slices/user";
import { getDbById, getDbByIdOrCreate } from "../slices/dbSlice";
import { Databases, spaceDatabase, userDatabase } from "./databases";
import { DatabaseAccessDeniedError, ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";

export type DatabaseType = "user" | "space";

export const ensureDatabaseAccessOrCreate = Effect.fn(
  "ensureDatabaseAccessOrCreate",
)(function* ({
  dbId,
  dbType,
  userId,
}: {
  dbId: string;
  dbType: DatabaseType;
  userId: string;
}) {
  if (dbType === "user") {
    if (userId !== dbId) {
      return yield* new DatabaseAccessDeniedError({ databaseType: dbType });
    }
    return;
  }

  const space = yield* select(yield* userDatabase(userId), {
    selector: getSpaceById,
    args: { id: dbId },
  });
  if (!space) {
    return yield* new ResourceNotFoundError({ resource: "Space" });
  }

  const mainDB = yield* (yield* Databases).main;
  const existing = yield* select(mainDB, {
    selector: getDbById,
    args: { id: dbId, type: dbType },
  });

  if (existing) {
    if (existing.userId !== userId) {
      return yield* new DatabaseAccessDeniedError({ databaseType: dbType });
    }
    return;
  }

  yield* dispatch(
    mainDB,
    getDbByIdOrCreate({ id: dbId, type: dbType, userId }),
  );
});

export const getSpaceDatabase = Effect.fn("getSpaceDatabase")(function* (
  spaceId: string,
  userId: string,
) {
  yield* ensureDatabaseAccessOrCreate({
    dbId: spaceId,
    dbType: "space",
    userId,
  });
  return yield* spaceDatabase(spaceId);
});
