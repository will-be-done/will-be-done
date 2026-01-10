import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";
import type { GenReturn } from "@will-be-done/slices/src/slices/utils";

export type Space = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export const spacesTable = table<Space>("spaces").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byUserId: { cols: ["userId"], type: "btree" },
});

export const spaceSlice = {
  // Selectors
  getSpaceById: selector(function* (id: string): GenReturn<Space | undefined> {
    const spaces = yield* runQuery(
      selectFrom(spacesTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return spaces[0];
  }),

  listSpacesByUserId: selector(function* (userId: string): GenReturn<Space[]> {
    const spaces = yield* runQuery(
      selectFrom(spacesTable, "byUserId").where((q) => q.eq("userId", userId)),
    );
    return spaces;
  }),

  // Actions
  createSpace: action(function* (
    userId: string,
    name: string,
  ): GenReturn<Space> {
    const spaceId = uuidv7();
    const now = new Date().toISOString();
    const space: Space = {
      id: spaceId,
      userId,
      name,
      createdAt: now,
      updatedAt: now,
    };

    yield* insert(spacesTable, [space]);

    return space;
  }),

  updateSpace: action(function* (
    id: string,
    name: string,
  ): GenReturn<Space | null> {
    const space = yield* spaceSlice.getSpaceById(id);
    if (!space) {
      return null;
    }

    const updatedSpace: Space = {
      ...space,
      name,
      updatedAt: new Date().toISOString(),
    };

    yield* update(spacesTable, [updatedSpace]);

    return updatedSpace;
  }),

  deleteSpace: action(function* (id: string): GenReturn<boolean> {
    const space = yield* spaceSlice.getSpaceById(id);
    if (!space) {
      return false;
    }

    yield* deleteRows(spacesTable, [id]);

    return true;
  }),
};
