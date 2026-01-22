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
import type { GenReturn } from "@will-be-done/slices";
import { registerUserSyncableTable } from "./syncMap";

export const spacesTableType = "space";
export type Space = {
  id: string;
  type: typeof spacesTableType;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export const spacesTable = table<Space>("spaces").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
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

  listSpaces: selector(function* (): GenReturn<Space[]> {
    const spaces = yield* runQuery(selectFrom(spacesTable, "byIds"));
    return spaces;
  }),

  // Actions
  createSpace: action(function* (name: string): GenReturn<Space> {
    const spaceId = uuidv7();
    const now = new Date().toISOString();
    const space: Space = {
      id: spaceId,
      type: spacesTableType,
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

registerUserSyncableTable(spacesTable, spacesTableType);
