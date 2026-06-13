import {
  defineTable,
  type ExtractSchema,
  selectFrom,
  selector,
  action,
  insert,
  v,
} from "@will-be-done/hyperdb-lib";

export const dbsTable = defineTable("dbs", {
  id: v.string(),
  type: v.union(v.literal("user"), v.literal("space")),
  userId: v.string(),
})
  .index("byIdTypes", ["id", "type"]);
export type Db = ExtractSchema<typeof dbsTable>;

const getById = selector(function* (id: string, type: "user" | "space") {
  const dbs = yield* selectFrom(dbsTable, "byIdTypes").where((q) =>
      q.eq("id", id).eq("type", type),
    );

  return dbs[0] as Db | undefined;
});

const getByIdOrCreate = action(function* (
  id: string,
  type: "user" | "space",
  userId: string,
) {
  const db = yield* getById(id, type);
  if (db) {
    if (db.userId !== userId) {
      throw new Error("User does not have access to this db");
    }

    return db;
  }

  const newDb: Db = {
    id,
    type,
    userId: userId,
  };

  yield* insert(dbsTable, [newDb]);

  return newDb;
});

export const dbSlice = {
  getById,
  getByIdOrCreate,
};
