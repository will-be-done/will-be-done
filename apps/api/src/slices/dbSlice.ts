import {
  runQuery,
  table,
  selectFrom,
  selector,
  action,
  insert,
} from "@will-be-done/hyperdb";
import { GenReturn } from "@will-be-done/slices";

export type Db = {
  id: string;
  type: "user" | "space";
  userId: string;
};

export const dbsTable = table<Db>("dbs").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIdTypes: { cols: ["id", "type"], type: "btree" },
});

export const dbSlice = {
  getById: selector(function* (
    id: string,
    type: "user" | "space",
  ): GenReturn<Db | undefined> {
    const dbs = yield* runQuery(
      selectFrom(dbsTable, "byIdTypes").where((q) =>
        q.eq("id", id).eq("type", type),
      ),
    );

    return dbs[0];
  }),
  getByIdOrCreate: action(function* (
    id: string,
    type: "user" | "space",
    userId: string,
  ): GenReturn<Db> {
    const db = yield* dbSlice.getById(id, type);
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
  }),
};
