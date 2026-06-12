/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";
import { execSync } from "../../core/executor";
import type { DBDriver } from "../../core/driver";
import type { Row } from "../../core/primitives";
import { DB } from "../../runtime/db";
import { SyncDB } from "../../runtime/sync-db";
import { defineTable, type TableDefinition } from "../../schema/table";
import { v } from "../../schema/values";
import { BptreeInmemDriver } from "../inmemory/bptree-inmem-driver";
import { initSqlJsWasm } from "./init-sql-js-wasm";
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { SqlDriver, type SQLStatement } from "./sql-driver";
import { normalizeWasmUrl } from "./wasm-url";
import type { SqlValue } from "./sqlite-common";

const compositeTable = defineTable("driverEdgeComposite", {
  id: v.string(),
  a: v.number(),
  b: v.string(),
}).index("byAThenB", ["a", "b"]);

const compositeTieTable = defineTable("driverEdgeCompositeTie", {
  id: v.string(),
  a: v.number(),
  b: v.string(),
}).index("byAThenB", ["a", "b"]);

const duplicateTable = defineTable("driverEdgeDuplicateIds", {
  id: v.string(),
  title: v.string(),
}).index("byTitle", ["title"]);

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

const hashLimitTable = defineTable("driverEdgeHashLimit", {
  id: v.string(),
  title: v.string(),
}).index("byTitle", ["title"], { type: "hash" });

const rollbackTable = defineTable("driverEdgeRollback", {
  id: v.string(),
  title: v.string(),
});

const mixedOrderTable = defineTable("driverEdgeMixedOrder", {
  id: v.string(),
  value: v.union(v.null(), v.boolean(), v.number(), v.string()),
}).index("byValue", ["value"]);

const stringOrderTable = defineTable("driverEdgeStringOrder", {
  id: v.string(),
  value: v.string(),
}).index("byValue", ["value"]);

const numberOrderTable = defineTable("driverEdgeNumberOrder", {
  id: v.string(),
  value: v.number(),
}).index("byValue", ["value"]);

const booleanOrderTable = defineTable("driverEdgeBooleanOrder", {
  id: v.string(),
  value: v.boolean(),
}).index("byValue", ["value"]);

const nullOrderTable = defineTable("driverEdgeNullOrder", {
  id: v.string(),
  value: v.null(),
}).index("byValue", ["value"]);

const fullValueOrderTable = {
  tableName: "driverEdgeFullValueOrder",
  schema: {},
  indexes: {
    byId: { type: "hash", cols: ["id"] },
    byValue: { type: "btree", cols: ["value"] },
  },
  idIndexName: "byId",
  index() {
    throw new Error("Not used in tests");
  },
} as unknown as TableDefinition<any, any>;

const schemalessPathIndexTable = {
  tableName: "driverEdgeSchemalessPathIndex",
  schema: {},
  indexes: {
    byId: { type: "hash", cols: ["id"] },
    byProfileName: { type: "btree", cols: ["profile.name"] },
  },
  idIndexName: "byId",
  index() {
    throw new Error("Not used in tests");
  },
} as unknown as TableDefinition<any, any>;

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
} as unknown as TableDefinition<any, any>;

const compositeRows = [
  { id: "1x", a: 1, b: "x" },
  { id: "1y", a: 1, b: "y" },
  { id: "2x", a: 2, b: "x" },
  { id: "2y", a: 2, b: "y" },
];

const driverFactories: [string, () => Promise<DBDriver>][] = [
  ["SqlDriver", () => initSqlJsWasm()],
  ["BptreeInmemDriver", async () => new BptreeInmemDriver()],
];

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

async function scanOrderIds(
  table: TableDefinition<any, any>,
  rows: Row[],
  order: "asc" | "desc",
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  for (const [driverName, createDriver] of driverFactories) {
    const db = new SyncDB(new DB(await createDriver()));
    db.loadTables([table]);
    db.insert(table, rows);

    result[driverName] = db
      .intervalScan(table, "byValue", [{}], { order })
      .map((row) => row.id);
  }

  return result;
}

async function scanOrderIdsWithDriver(
  table: TableDefinition<any, any>,
  rows: Row[],
  order: "asc" | "desc",
  createDriver: () => Promise<DBDriver>,
): Promise<string[]> {
  const db = new SyncDB(new DB(await createDriver()));
  db.loadTables([table]);
  db.insert(table, rows);

  return db
    .intervalScan(table, "byValue", [{}], { order })
    .map((row) => row.id);
}

describe("driver edge case regressions", () => {
  describe("SQLite normalized index scans", () => {
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
          sql.includes(
            "ON driverEdgeNoSideTables(idx_byTitle_sort_key, id)",
          ),
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

    it("accepts schemaless index path members that are not SQL identifiers", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([schemalessPathIndexTable]);
      db.insert(schemalessPathIndexTable, [
        { id: "user-a", "profile.name": "Ada" },
      ]);

      expect(
        db.intervalScan(schemalessPathIndexTable, "byProfileName", [
          { eq: [{ col: "profile.name", val: "Ada" }] },
        ]),
      ).toEqual([{ id: "user-a", "profile.name": "Ada" }]);
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

    it("orders encoded schemaless values before applying limit", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([fullValueOrderTable]);
      db.insert(fullValueOrderTable, [
        { id: "object", value: { a: 1 } },
        { id: "array", value: [1, "a"] },
        { id: "bytes", value: new Uint8Array([1, 2]).buffer },
        { id: "string", value: "a" },
        { id: "boolean", value: false },
        { id: "number", value: 1.5 },
        { id: "bigint", value: 1n },
        { id: "null", value: null },
        { id: "missing" },
      ] as Row[]);

      expect(
        db
          .intervalScan(fullValueOrderTable, "byValue", [{}], { limit: 4 })
          .map((row) => row.id),
      ).toEqual(["missing", "null", "bigint", "number"]);
      expect(
        db
          .intervalScan(fullValueOrderTable, "byValue", [{}], {
            order: "desc",
            limit: 3,
          })
          .map((row) => row.id),
      ).toEqual(["object", "array", "bytes"]);
    });

    it("uses id as the final stable tiebreaker for composite btree scans", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([compositeTieTable]);
      db.insert(compositeTieTable, [
        { id: "row-c", a: 1, b: "same" },
        { id: "row-a", a: 1, b: "same" },
        { id: "row-b", a: 1, b: "same" },
      ]);

      expect(
        db
          .intervalScan(compositeTieTable, "byAThenB", [{}], { limit: 2 })
          .map((row) => row.id),
      ).toEqual(["row-a", "row-b"]);
      expect(
        db
          .intervalScan(compositeTieTable, "byAThenB", [{}], {
            order: "desc",
            limit: 2,
          })
          .map((row) => row.id),
      ).toEqual(["row-c", "row-b"]);
    });

    it("keeps disjoint OR range scans globally ordered before limit", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([numberOrderTable]);
      db.insert(numberOrderTable, [
        { id: "three", value: 3 },
        { id: "two", value: 2 },
        { id: "one", value: 1 },
        { id: "zero", value: 0 },
        { id: "negative", value: -1 },
      ]);

      expect(
        db
          .intervalScan(
            numberOrderTable,
            "byValue",
            [
              { lte: [{ col: "value", val: 0 }] },
              { gte: [{ col: "value", val: 2 }] },
            ],
            { limit: 3 },
          )
          .map((row) => row.id),
      ).toEqual(["negative", "zero", "two"]);
    });

    it("dedupes overlapping OR ranges before final limit semantics", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([numberOrderTable]);
      db.insert(numberOrderTable, [
        { id: "four", value: 4 },
        { id: "three", value: 3 },
        { id: "two", value: 2 },
        { id: "one", value: 1 },
        { id: "zero", value: 0 },
      ]);

      expect(
        db
          .intervalScan(
            numberOrderTable,
            "byValue",
            [
              {
                gte: [{ col: "value", val: 0 }],
                lte: [{ col: "value", val: 3 }],
              },
              {
                gte: [{ col: "value", val: 2 }],
                lte: [{ col: "value", val: 4 }],
              },
            ],
            { limit: 5 },
          )
          .map((row) => row.id),
      ).toEqual(["zero", "one", "two", "three", "four"]);
    });

    it("rolls back failed base-table writes without stale sort keys", async () => {
      const db = new SyncDB(new DB(await initSqlJsWasm()));
      db.loadTables([duplicateTable]);
      db.insert(duplicateTable, [{ id: "task-a", title: "A" }]);

      expect(() =>
        db.insert(duplicateTable, [
          { id: "task-b", title: "B" },
          { id: "task-a", title: "Duplicate" },
        ]),
      ).toThrow(/duplicate|constraint|unique/i);

      expect(
        db
          .intervalScan(duplicateTable, "byTitle", [{}])
          .map((row) => row.id),
      ).toEqual(["task-a"]);

      db.insert(duplicateTable, [{ id: "task-c", title: "C" }]);
      expect(
        db
          .intervalScan(duplicateTable, "byTitle", [{}])
          .map((row) => row.id),
      ).toEqual(["task-a", "task-c"]);
    });
  });

  describe("ordering parity", () => {
    for (const [driverName, createDriver] of driverFactories) {
      it(`orders the full stored value type ladder for ${driverName}`, async () => {
        const rows = [
          { id: "missing" },
          { id: "null", value: null },
          { id: "bigint", value: 1n },
          { id: "number", value: 1.5 },
          { id: "boolean", value: false },
          { id: "string", value: "a" },
          { id: "bytes", value: new Uint8Array([1, 2]).buffer },
          { id: "array", value: [1, "a"] },
          { id: "object", value: { a: 1 } },
        ] as Row[];

        const asc = [
          "missing",
          "null",
          "bigint",
          "number",
          "boolean",
          "string",
          "bytes",
          "array",
          "object",
        ];
        const desc = [...asc].reverse();

        expect(
          await scanOrderIdsWithDriver(
            fullValueOrderTable,
            rows,
            "asc",
            createDriver,
          ),
        ).toEqual(asc);
        expect(
          await scanOrderIdsWithDriver(
            fullValueOrderTable,
            rows,
            "desc",
            createDriver,
          ),
        ).toEqual(desc);
      });
    }

    it("orders mixed comparable scalar types the same across SQLite and B+ tree", async () => {
      const rows = [
        { id: "null", value: null },
        { id: "false", value: false },
        { id: "zero", value: 0 },
        { id: "true", value: true },
        { id: "one", value: 1 },
        { id: "negative", value: -1 },
        { id: "empty-string", value: "" },
        { id: "string-zero", value: "0" },
        { id: "string-a", value: "a" },
      ];

      expect(await scanOrderIds(mixedOrderTable, rows, "asc")).toEqual({
        SqlDriver: [
          "null",
          "negative",
          "false",
          "zero",
          "one",
          "true",
          "empty-string",
          "string-zero",
          "string-a",
        ],
        BptreeInmemDriver: [
          "null",
          "negative",
          "false",
          "zero",
          "one",
          "true",
          "empty-string",
          "string-zero",
          "string-a",
        ],
      });
      expect(await scanOrderIds(mixedOrderTable, rows, "desc")).toEqual({
        SqlDriver: [
          "string-a",
          "string-zero",
          "empty-string",
          "true",
          "one",
          "zero",
          "false",
          "negative",
          "null",
        ],
        BptreeInmemDriver: [
          "string-a",
          "string-zero",
          "empty-string",
          "true",
          "one",
          "zero",
          "false",
          "negative",
          "null",
        ],
      });
    });

    it("orders nested schemaless stored values the same across SQLite and B+ tree", async () => {
      const rows = [
        { id: "bytes-one", value: new Uint8Array([1]) },
        { id: "object-b", value: { b: 0 } },
        { id: "array-zero-null", value: [0, null] },
        { id: "object-a2", value: { a: 2 } },
        { id: "bytes-prefix", value: new Uint8Array([0]) },
        { id: "array-string", value: ["a"] },
        { id: "object-empty", value: {} },
        { id: "bytes-empty", value: new Uint8Array([]) },
        { id: "array-empty", value: [] },
        { id: "object-ab", value: { a: 999, b: 0 } },
        { id: "array-one", value: [1] },
        { id: "bytes-long", value: new Uint8Array([0, 1]) },
        { id: "array-zero", value: [0] },
        { id: "object-a1", value: { a: 1 } },
        { id: "array-null", value: [null] },
      ] as Row[];
      const asc = [
        "bytes-empty",
        "bytes-prefix",
        "bytes-long",
        "bytes-one",
        "array-empty",
        "array-null",
        "array-zero",
        "array-zero-null",
        "array-one",
        "array-string",
        "object-empty",
        "object-a1",
        "object-a2",
        "object-ab",
        "object-b",
      ];

      expect(await scanOrderIds(fullValueOrderTable, rows, "asc")).toEqual({
        SqlDriver: asc,
        BptreeInmemDriver: asc,
      });
      expect(await scanOrderIds(fullValueOrderTable, rows, "desc")).toEqual({
        SqlDriver: [...asc].reverse(),
        BptreeInmemDriver: [...asc].reverse(),
      });
    });

    it("applies schemaless missing and null range bounds the same across drivers", async () => {
      const rows = [
        { id: "number", value: 1 },
        { id: "missing-b" },
        { id: "null-b", value: null },
        { id: "missing-a" },
        { id: "null-a", value: null },
        { id: "string", value: "a" },
      ] as Row[];

      for (const [, createDriver] of driverFactories) {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([fullValueOrderTable]);
        db.insert(fullValueOrderTable, rows);

        expect(
          db
            .intervalScan(fullValueOrderTable, "byValue", [
              { lte: [{ col: "value", val: null }] },
            ])
            .map((row) => row.id),
        ).toEqual(["missing-a", "missing-b", "null-a", "null-b"]);
        expect(
          db
            .intervalScan(fullValueOrderTable, "byValue", [
              { gt: [{ col: "value", val: null }] },
            ])
            .map((row) => row.id),
        ).toEqual(["number", "string"]);
      }
    });

    it("orders values of each same scalar type the same across SQLite and B+ tree", async () => {
      const cases = [
        {
          table: stringOrderTable,
          rows: [
            { id: "string-b", value: "b" },
            { id: "string-empty", value: "" },
            { id: "string-a", value: "a" },
            { id: "string-aa", value: "aa" },
          ],
          asc: ["string-empty", "string-a", "string-aa", "string-b"],
          desc: ["string-b", "string-aa", "string-a", "string-empty"],
        },
        {
          table: numberOrderTable,
          rows: [
            { id: "number-zero", value: 0 },
            { id: "number-negative", value: -1 },
            { id: "number-fraction", value: 1.5 },
            { id: "number-one", value: 1 },
          ],
          asc: [
            "number-negative",
            "number-zero",
            "number-one",
            "number-fraction",
          ],
          desc: [
            "number-fraction",
            "number-one",
            "number-zero",
            "number-negative",
          ],
        },
        {
          table: booleanOrderTable,
          rows: [
            { id: "true-a", value: true },
            { id: "false-b", value: false },
            { id: "true-b", value: true },
            { id: "false-a", value: false },
          ],
          asc: ["false-a", "false-b", "true-a", "true-b"],
          desc: ["true-b", "true-a", "false-b", "false-a"],
        },
        {
          table: nullOrderTable,
          rows: [
            { id: "null-b", value: null },
            { id: "null-a", value: null },
            { id: "null-c", value: null },
          ],
          asc: ["null-a", "null-b", "null-c"],
          desc: ["null-c", "null-b", "null-a"],
        },
      ];

      for (const testCase of cases) {
        expect(
          await scanOrderIds(testCase.table, testCase.rows, "asc"),
        ).toEqual({
          SqlDriver: testCase.asc,
          BptreeInmemDriver: testCase.asc,
        });
        expect(
          await scanOrderIds(testCase.table, testCase.rows, "desc"),
        ).toEqual({
          SqlDriver: testCase.desc,
          BptreeInmemDriver: testCase.desc,
        });
      }
    });
  });

  for (const [driverName, createDriver] of driverFactories) {
    describe(driverName, () => {
      it("composite OR equality scans preserve tuple pairings", async () => {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([compositeTable]);
        db.insert(compositeTable, compositeRows);

        const results = db.intervalScan(compositeTable, "byAThenB", [
          {
            eq: [
              { col: "a", val: 1 },
              { col: "b", val: "x" },
            ],
          },
          {
            eq: [
              { col: "a", val: 2 },
              { col: "b", val: "y" },
            ],
          },
        ]);

        expect(results.map((row) => row.id)).toEqual(["1x", "2y"]);
      });

      it("rejects non-prefix composite range clauses when called directly", async () => {
        const driver = await createDriver();
        execSync(driver.loadTables([compositeTable]));
        execSync(
          driver.insert(compositeTable.tableName, compositeRows as Row[]),
        );

        expect(() =>
          execSync(
            driver.intervalScan(
              compositeTable.tableName,
              "byAThenB",
              [
                {
                  gte: [
                    { col: "a", val: 1 },
                    { col: "b", val: "y" },
                  ],
                },
              ],
              {},
            ),
          ),
        ).toThrow(/Cannot use column 'b'/);
      });

      it("insert rejects duplicate ids before secondary indexes go stale", async () => {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([duplicateTable]);

        db.insert(duplicateTable, [{ id: "same-id", title: "Old title" }]);

        expect(() =>
          db.insert(duplicateTable, [{ id: "same-id", title: "New title" }]),
        ).toThrow(/duplicate|exists/i);
      });

      it("upsert rejects duplicate ids before deleting existing rows", async () => {
        if (driverName !== "BptreeInmemDriver") return;

        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([duplicateTable]);
        db.insert(duplicateTable, [{ id: "task-1", title: "Existing" }]);

        expect(() =>
          db.upsert(duplicateTable, [
            { id: "task-1", title: "First" },
            { id: "task-1", title: "Second" },
          ]),
        ).toThrow(/duplicate|exists/i);

        expect(
          db.intervalScan(duplicateTable, "byTitle", [
            { eq: [{ col: "title", val: "Existing" }] },
          ]),
        ).toEqual([{ id: "task-1", title: "Existing" }]);
      });

      it("upsert replaces rows and replaces indexed sort keys", async () => {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([duplicateTable]);
        db.insert(duplicateTable, [{ id: "task-1", title: "A" }]);

        db.upsert(duplicateTable, [
          { id: "task-1", title: "C" },
          { id: "task-2", title: "B" },
        ]);

        expect(
          db
            .intervalScan(duplicateTable, "byTitle", [{}])
            .map((row) => row.id),
        ).toEqual(["task-2", "task-1"]);
        expect(
          db.intervalScan(duplicateTable, "byTitle", [
            { eq: [{ col: "title", val: "C" }] },
          ]),
        ).toEqual([{ id: "task-1", title: "C" }]);
      });

      it("hash transaction scans apply limit after filtering deleted rows", async () => {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([hashLimitTable]);
        db.insert(hashLimitTable, [
          { id: "task-1", title: "Same" },
          { id: "task-2", title: "Same" },
          { id: "task-3", title: "Same" },
        ]);

        const tx = db.beginTx();
        tx.delete(hashLimitTable, ["task-1"]);

        const results = tx.intervalScan(
          hashLimitTable,
          "byTitle",
          [{ eq: [{ col: "title", val: "Same" }] }],
          { limit: 2 },
        );

        expect(results).toHaveLength(2);
        expect(results.map((row) => row.id)).toEqual(
          expect.arrayContaining(["task-2", "task-3"]),
        );
        tx.rollback();
      });

      it("write failures rollback before later writes start a new transaction", async () => {
        const driver = await createDriver();
        const db = new SyncDB(new DB(driver));
        db.loadTables([rollbackTable]);

        expect(() =>
          execSync(
            driver.insert("missingRollbackTable", [{ id: "bad" } as Row]),
          ),
        ).toThrow();

        const goodRecord = { id: "good", title: "Good" };
        expect(() => db.insert(rollbackTable, [goodRecord])).not.toThrow();
        expect(
          db.intervalScan(rollbackTable, "byId", [
            { eq: [{ col: "id", val: "good" }] },
          ]),
        ).toEqual([goodRecord]);
      });

      it("rejects SQL and JSON-path unsafe table definitions", async () => {
        const unsafeTables = [
          defineTable("unsafe table name", {
            id: v.string(),
          }),
          defineTable("safeIdentifierTable", {
            id: v.string(),
            title: v.string(),
          }).index("by title" as never, ["title"] as never),
        ];

        const throws = [];
        for (const table of unsafeTables) {
          const db = new SyncDB(new DB(await createDriver()));
          try {
            db.loadTables([table]);
            throws.push(false);
          } catch {
            throws.push(true);
          }
        }

        expect(throws).toEqual([true, true]);
      });
    });
  }
});
