import { deleteRows, insert, selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { dbsTable, type Db } from "./tables";

export { dbsTable, type Db } from "./tables";

export const getDbById = selector({
  name: "getDbById",
  args: {
    id: v.string(),
    type: v.union(v.literal("user"), v.literal("space")),
  },
  handler: function* getDbById({ id, type }) {
    const dbs = yield* selectFrom(dbsTable, "byIdTypes").where((q) =>
      q.eq("id", id).eq("type", type),
    );
    return dbs[0] as Db | undefined;
  },
});

export const getDbByIdOrCreate = action({
  name: "getDbByIdOrCreate",
  args: {
    id: v.string(),
    type: v.union(v.literal("user"), v.literal("space")),
    userId: v.string(),
  },
  handler: function* getDbByIdOrCreate({ id, type, userId }) {
    const db = yield* getDbById({ id, type });
    if (db) {
      if (db.userId !== userId) {
        throw new Error("User does not have access to this db");
      }
      return db;
    }

    const newDb: Db = {
      id,
      type,
      userId,
    };

    yield* insert(dbsTable, [newDb]);

    return newDb;
  },
});

export const deleteDb = action({
  name: "deleteDb",
  args: {
    id: v.string(),
    type: v.union(v.literal("user"), v.literal("space")),
  },
  handler: function* deleteDb({ id, type }) {
    const db = yield* getDbById({ id, type });
    if (!db) return false;
    yield* deleteRows(dbsTable, [db.id]);
    return true;
  },
});
