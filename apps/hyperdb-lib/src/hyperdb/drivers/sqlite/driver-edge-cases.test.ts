import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { describe, expect, it } from "vitest";
import { DB } from "../../runtime/db";
import { SyncDB } from "../../runtime/sync-db";
import {
  defineTable,
  type AnyIndexDefinitions,
  type TableDefinition,
} from "../../schema/table";
import { v } from "../../schema/values";
import { initSqlJsWasm } from "./init-sql-js-wasm";
import { SqlDriver, type SQLStatement } from "./sql-driver";
import type { SqlValue } from "./sqlite-common";
import { normalizeWasmUrl } from "./wasm-url";

const noSideTablesTable = defineTable("driverEdgeNoSideTables", {
  id: v.string(),
  title: v.string(),
}).index("byTitle", ["title"]);

const sortKeyBackfillTableV1 = defineTable("driverEdgeSortKeyBackfill", {
  id: v.string(),
  title: v.string(),
});

const sortKeyBackfillTableV2 = defineTable("driverEdgeSortKeyBackfill", {
  id: v.string(),
  title: v.string(),
}).index("byTitle", ["title"]);

const pruneSortKeysTableV1 = defineTable("driverEdgePruneSortKeys", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
}).index("byTitle", ["title"]);

const pruneSortKeysTableV2 = defineTable("driverEdgePruneSortKeys", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
}).index("byState", ["state"]);

const multiColumnHashTable = {
  tableName: "driverEdgeMultiColumnHash",
  schema: {},
  indexes: {
    byId: { type: "hash", cols: ["id"] },
    byProjectState: { type: "hash", cols: ["projectId", "state"] },
  },
  idIndexName: "byId",
  index() {
    throw new Error("Not used in tests");
  },
} as unknown as TableDefinition<unknown, AnyIndexDefinitions>;

type InspectableSqlDatabase = {
  exec(sql: string, params?: SqlValue[]): { values: SqlValue[][] }[];
  prepare(sql: string): {
    bind(values: SqlValue[]): boolean;
    step(): boolean;
    get(): SqlValue[];
    free(): void;
  };
};

async function createInspectableSqlDriver(): Promise<{
  driver: SqlDriver;
  sqldb: InspectableSqlDatabase;
}> {
  const SQL = await initSqlJs({
    locateFile: () => normalizeWasmUrl(wasmUrl),
  });
  const sqldb: InspectableSqlDatabase = new SQL.Database();

  return {
    sqldb,
    driver: new SqlDriver({
      exec(sql: string, params: SqlValue[]): void {
        sqldb.exec(sql, params);
      },
      prepare(sql: string): SQLStatement {
        const prepared = sqldb.prepare(sql);

        return {
          values(values: SqlValue[]): SqlValue[][] {
            prepared.bind(values);

            const result: SqlValue[][] = [];
            while (prepared.step()) {
              result.push(prepared.get());
            }

            return result;
          },
          finalize(): void {
            prepared.free();
          },
        };
      },
    }),
  };
}

function sqliteRows(
  sqldb: InspectableSqlDatabase,
  sql: string,
): SqlValue[][] {
  return sqldb.exec(sql)[0]?.values ?? [];
}

describe("SQLite driver edge case regressions", () => {
  it("backfills sort keys for rows that predate a new index", async () => {
    const db = new SyncDB(new DB(await initSqlJsWasm()));
    db.loadTables([sortKeyBackfillTableV1]);
    db.insert(sortKeyBackfillTableV1, [{ id: "task-a", title: "A" }]);

    db.loadTables([sortKeyBackfillTableV2]);

    expect(
      db.intervalScan(sortKeyBackfillTableV2, "byTitle", [
        { eq: [{ col: "title", val: "A" }] },
      ]),
    ).toEqual([{ id: "task-a", title: "A" }]);
  });

  it("drops sort-key indexes and columns that are no longer in the schema", async () => {
    const { driver, sqldb } = await createInspectableSqlDriver();
    const db = new SyncDB(new DB(driver));

    db.loadTables([pruneSortKeysTableV1]);
    db.insert(pruneSortKeysTableV1, [
      { id: "task-a", title: "A", state: "todo" },
      { id: "task-b", title: "B", state: "done" },
    ]);

    db.loadTables([pruneSortKeysTableV2]);

    const columns = sqliteRows(
      sqldb,
      "PRAGMA table_info(driverEdgePruneSortKeys)",
    ).map((row) => String(row[1]));
    expect(columns).toEqual([
      "id",
      "data",
      "idx_byId_sort_key",
      "idx_byState_sort_key",
    ]);

    const indexNames = sqliteRows(
      sqldb,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'driverEdgePruneSortKeys'",
    ).map(([name]) => String(name));
    expect(indexNames).toContain("idx_driverEdgePruneSortKeys_byState_sort_key");
    expect(indexNames).not.toContain(
      "idx_driverEdgePruneSortKeys_byTitle_sort_key",
    );

    expect(
      db.intervalScan(pruneSortKeysTableV2, "byState", [
        { eq: [{ col: "state", val: "done" }] },
      ]),
    ).toEqual([{ id: "task-b", title: "B", state: "done" }]);
  });

  it("supports tuple equality bounds for direct multi-column hash definitions", async () => {
    const db = new SyncDB(new DB(await initSqlJsWasm()));
    db.loadTables([multiColumnHashTable]);
    db.insert(multiColumnHashTable, [
      { id: "task-a", projectId: "project-1", state: "open" },
      { id: "task-b", projectId: "project-1", state: "done" },
    ]);

    expect(
      db.intervalScan(multiColumnHashTable, "byProjectState", [
        {
          eq: [
            { col: "projectId", val: "project-1" },
            { col: "state", val: "open" },
          ],
        },
      ]),
    ).toEqual([{ id: "task-a", projectId: "project-1", state: "open" }]);
  });

  it("stores index sort keys on the base table and scans without side-index tables", async () => {
    const { driver, sqldb } = await createInspectableSqlDriver();
    const db = new SyncDB(new DB(driver));
    db.loadTables([noSideTablesTable]);
    db.insert(noSideTablesTable, [
      { id: "task-c", title: "C" },
      { id: "task-a", title: "A" },
      { id: "task-b", title: "B" },
    ]);

    const tableNames = sqliteRows(
      sqldb,
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).map(([name]) => String(name));
    expect(tableNames).toEqual(["driverEdgeNoSideTables"]);
    expect(tableNames.some((name) => name.endsWith("__idx"))).toBe(false);

    const columns = sqliteRows(
      sqldb,
      "PRAGMA table_info(driverEdgeNoSideTables)",
    ).map((row) => String(row[1]));
    expect(columns).toEqual([
      "id",
      "data",
      "idx_byId_sort_key",
      "idx_byTitle_sort_key",
    ]);

    const indexSql = sqliteRows(
      sqldb,
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'driverEdgeNoSideTables'",
    ).map(([sql]) => String(sql));
    expect(
      indexSql.some((sql) =>
        sql.includes("ON driverEdgeNoSideTables(idx_byTitle_sort_key, id)"),
      ),
    ).toBe(true);
    expect(
      indexSql.some((sql) =>
        sql.includes("WHERE idx_byTitle_sort_key IS NOT NULL"),
      ),
    ).toBe(true);

    expect(
      db
        .intervalScan(noSideTablesTable, "byTitle", [{}], { limit: 2 })
        .map((row) => row.id),
    ).toEqual(["task-a", "task-b"]);
  });
});
