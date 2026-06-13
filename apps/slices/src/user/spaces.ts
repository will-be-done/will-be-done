import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  upsert,
  v,
} from "@will-be-done/hyperdb-lib";
import { uuidv7 } from "uuidv7";
import { registerUserSyncableTable } from "./syncMap";

export const spacesTableType = "space";

export const spacesTable = defineTable("spaces", {
  id: v.string(),
  type: v.literal(spacesTableType),
  name: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
})
  .index("byIds", ["id"]);
export type Space = ExtractSchema<typeof spacesTable>;

const getSpaceById = selector(function* (id: string) {
  const spaces = yield* selectFrom(spacesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return spaces[0] as Space | undefined;
});

const listSpaces = selector(function* () {
  const spaces = yield* selectFrom(spacesTable, "byIds");
  return spaces as Space[];
});

const createSpace = action(function* (name: string) {
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
});

const updateSpace = action(function* (id: string, name: string) {
  const space = yield* getSpaceById(id);
  if (!space) {
    return null as Space | null;
  }

  const updatedSpace: Space = {
    ...space,
    name,
    updatedAt: new Date().toISOString(),
  };

  yield* upsert(spacesTable, [updatedSpace]);

  return updatedSpace as Space | null;
});

const deleteSpace = action(function* (id: string) {
  const space = yield* getSpaceById(id);
  if (!space) {
    return false;
  }

  yield* deleteRows(spacesTable, [id]);

  return true;
});

export const spaceSlice = {
  getSpaceById,
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
};

registerUserSyncableTable(spacesTable, spacesTableType);
