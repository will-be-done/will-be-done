import {
  runQuery,
  table,
  selectFrom,
  selector,
  action,
  insert,
} from "@will-be-done/hyperdb";

export type Db = {
  id: string;
  type: "user" | "space";
  userId: string;
};

export const dbsTable = table<Db>("dbs").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIdTypes: { cols: ["id", "type"], type: "btree" },
});

const getById = selector(function* (id: string, type: "user" | "space") {
  const dbs = yield* runQuery(
    selectFrom(dbsTable, "byIdTypes").where((q) =>
      q.eq("id", id).eq("type", type),
    ),
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
