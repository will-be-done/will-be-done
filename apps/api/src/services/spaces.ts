import { Effect } from "effect";
import {
  createSpace,
  deleteSpace,
  getSpaceById,
  listSpaces,
  updateSpace,
} from "@will-be-done/slices/user";
import { deleteDb } from "../slices/dbSlice";
import { getSpaceDatabase } from "./databaseAccess";
import { Databases } from "./databases";
import { dispatch, select } from "./hyperdb";

export interface PublicSpace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function toPublicSpace({
  id,
  name,
  createdAt,
  updatedAt,
}: PublicSpace): PublicSpace {
  return { id, name, createdAt, updatedAt };
}

const userDatabase = (userId: string) =>
  Databases.use((databases) => databases.user(userId));

export const listUserSpaces = Effect.fn("listUserSpaces")(function* ({
  userId,
}: {
  userId: string;
}) {
  const spaces = yield* select(yield* userDatabase(userId), {
    selector: listSpaces,
    args: {},
  });
  return spaces.map(toPublicSpace);
});

export const getUserSpace = Effect.fn("getUserSpace")(function* ({
  userId,
  spaceId,
}: {
  userId: string;
  spaceId: string;
}) {
  const space = yield* select(yield* userDatabase(userId), {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  return space ? toPublicSpace(space) : null;
});

export const createUserSpace = Effect.fn("createUserSpace")(function* ({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const databases = yield* Databases;
  const userDB = yield* databases.user(userId);
  const space = yield* dispatch(userDB, createSpace({ name }));

  const rollback = Effect.all(
    [
      dispatch(userDB, deleteSpace({ id: space.id })).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("Failed to roll back user space creation", cause),
        ),
      ),
      databases.main.pipe(
        Effect.flatMap((mainDB) =>
          dispatch(mainDB, deleteDb({ id: space.id, type: "space" })),
        ),
        Effect.catchCause((cause) =>
          Effect.logError(
            "Failed to roll back space database registration",
            cause,
          ),
        ),
      ),
    ],
    { discard: true },
  );
  yield* getSpaceDatabase(space.id, userId).pipe(
    Effect.onError(() => rollback),
  );

  return toPublicSpace(space);
});

export const deleteUserSpace = Effect.fn("deleteUserSpace")(function* ({
  userId,
  spaceId,
}: {
  userId: string;
  spaceId: string;
}) {
  const databases = yield* Databases;
  const userDB = yield* databases.user(userId);
  const space = yield* select(userDB, {
    selector: getSpaceById,
    args: { id: spaceId },
  });
  if (!space) return false;

  yield* dispatch(
    yield* databases.main,
    deleteDb({ id: spaceId, type: "space" }),
  );
  return yield* dispatch(userDB, deleteSpace({ id: spaceId }));
});

export const updateUserSpace = Effect.fn("updateUserSpace")(function* ({
  userId,
  spaceId,
  name,
}: {
  userId: string;
  spaceId: string;
  name: string;
}) {
  const space = yield* dispatch(
    yield* userDatabase(userId),
    updateSpace({ id: spaceId, name }),
  );
  return space ? toPublicSpace(space) : null;
});
