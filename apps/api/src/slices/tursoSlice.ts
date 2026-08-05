import {
  action,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";

export type TursoDbToken = {
  id: string;
  dbType: "user" | "space";
  dbId: string;
  databaseName: string;
  databaseUrl: string;
  authToken: string;
  createdAt: string;
  updatedAt: string;
};

export const tursoDbTokensTable = table<TursoDbToken>(
  "tursoDbTokens",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byDb: { cols: ["dbType", "dbId"], type: "btree" },
});

const getById = selector(function* (id: string) {
  const tokens = yield* runQuery(
    selectFrom(tursoDbTokensTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );

  return tokens[0] as TursoDbToken | undefined;
});

const upsert = action(function* (token: TursoDbToken) {
  const existing = yield* getById(token.id);

  if (existing) {
    yield* update(tursoDbTokensTable, [token]);
  } else {
    yield* insert(tursoDbTokensTable, [token]);
  }

  return token;
});

export const tursoSlice = {
  getById,
  upsert,
};
