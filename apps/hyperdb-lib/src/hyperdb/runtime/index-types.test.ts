/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";
import type { DBDriver } from "../core/driver";
import type { Row, Value, WhereClause } from "../core/primitives";
import { BptreeInmemDriver } from "../drivers/inmemory/bptree-inmem-driver";
import { initSqlJsWasm } from "../drivers/sqlite/init-sql-js-wasm";
import { defineTable, type TableDefinition } from "../schema/table";
import { v } from "../schema/values";
import { DB } from "./db";
import { SyncDB } from "./sync-db";

const stringTable = defineTable("indexTypesString", {
  id: v.string(),
  value: v.string(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const bigintTable = defineTable("indexTypesBigint", {
  id: v.string(),
  value: v.bigint(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const numberTable = defineTable("indexTypesNumber", {
  id: v.string(),
  value: v.number(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const booleanTable = defineTable("indexTypesBoolean", {
  id: v.string(),
  value: v.boolean(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const arrayBufferTable = defineTable("indexTypesArrayBuffer", {
  id: v.string(),
  value: v.arrayBuffer(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const nullTable = defineTable("indexTypesNull", {
  id: v.string(),
  value: v.null(),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const literalTable = defineTable("indexTypesLiteral", {
  id: v.string(),
  value: v.literal(1n),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const optionalTable = defineTable("indexTypesOptional", {
  id: v.string(),
  value: v.optional(v.bigint()),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const unionTable = defineTable("indexTypesUnion", {
  id: v.string(),
  value: v.union(v.null(), v.bigint(), v.number(), v.boolean(), v.string()),
})
  .index("byValue", ["value"])
  .index("byValueHash", ["value"], { type: "hash" });

const unionObjectTable = defineTable(
  "indexTypesUnionObject",
  v.union(
    v.object({
      id: v.string(),
      type: v.literal("task"),
      content: v.string(),
      count: v.number(),
      unionType: v.boolean(),
    }),
    v.object({
      id: v.string(),
      type: v.literal("template"),
      template: v.string(),
      unionType: v.number(),
    }),
  ),
)
  .index("byContent", ["content"])
  .index("byCount", ["count"])
  .index("byTemplate", ["template"])
  .index("byUnionType", ["unionType"]);

type IndexTypeCase = {
  name: string;
  table: TableDefinition<any, any>;
  rows: Row[];
  eqValue: Value;
  eqIds: string[];
  scanIds: string[];
  range?: {
    clauses: WhereClause[];
    ids: string[];
  };
};

const buffer = (...bytes: number[]): ArrayBuffer =>
  new Uint8Array(bytes).buffer as ArrayBuffer;

const cases: IndexTypeCase[] = [
  {
    name: "string",
    table: stringTable,
    rows: [
      { id: "string-c", value: "c" },
      { id: "string-a", value: "a" },
      { id: "string-b", value: "b" },
    ],
    eqValue: "b",
    eqIds: ["string-b"],
    scanIds: ["string-a", "string-b", "string-c"],
    range: {
      clauses: [
        {
          gt: [{ col: "value", val: "a" }],
          lt: [{ col: "value", val: "c" }],
        },
      ],
      ids: ["string-b"],
    },
  },
  {
    name: "bigint",
    table: bigintTable,
    rows: [
      { id: "bigint-3", value: 3n },
      { id: "bigint-1", value: 1n },
      { id: "bigint-2", value: 2n },
    ],
    eqValue: 2n,
    eqIds: ["bigint-2"],
    scanIds: ["bigint-1", "bigint-2", "bigint-3"],
    range: {
      clauses: [
        {
          gt: [{ col: "value", val: 1n }],
          lt: [{ col: "value", val: 3n }],
        },
      ],
      ids: ["bigint-2"],
    },
  },
  {
    name: "number",
    table: numberTable,
    rows: [
      { id: "number-3", value: 3 },
      { id: "number-1", value: 1 },
      { id: "number-2", value: 2 },
    ],
    eqValue: 2,
    eqIds: ["number-2"],
    scanIds: ["number-1", "number-2", "number-3"],
    range: {
      clauses: [
        {
          gt: [{ col: "value", val: 1 }],
          lt: [{ col: "value", val: 3 }],
        },
      ],
      ids: ["number-2"],
    },
  },
  {
    name: "boolean",
    table: booleanTable,
    rows: [
      { id: "boolean-true", value: true },
      { id: "boolean-false", value: false },
    ],
    eqValue: true,
    eqIds: ["boolean-true"],
    scanIds: ["boolean-false", "boolean-true"],
    range: {
      clauses: [{ gt: [{ col: "value", val: false }] }],
      ids: ["boolean-true"],
    },
  },
  {
    name: "arrayBuffer",
    table: arrayBufferTable,
    rows: [
      { id: "bytes-one", value: buffer(1) },
      { id: "bytes-prefix", value: buffer(0) },
      { id: "bytes-long", value: buffer(0, 1) },
      { id: "bytes-empty", value: buffer() },
    ],
    eqValue: buffer(0, 1),
    eqIds: ["bytes-long"],
    scanIds: ["bytes-empty", "bytes-prefix", "bytes-long", "bytes-one"],
    range: {
      clauses: [
        {
          gt: [{ col: "value", val: buffer(0) }],
          lt: [{ col: "value", val: buffer(1) }],
        },
      ],
      ids: ["bytes-long"],
    },
  },
  {
    name: "null",
    table: nullTable,
    rows: [
      { id: "null-b", value: null },
      { id: "null-a", value: null },
    ],
    eqValue: null,
    eqIds: ["null-a", "null-b"],
    scanIds: ["null-a", "null-b"],
  },
  {
    name: "literal",
    table: literalTable,
    rows: [
      { id: "literal-b", value: 1n },
      { id: "literal-a", value: 1n },
    ],
    eqValue: 1n,
    eqIds: ["literal-a", "literal-b"],
    scanIds: ["literal-a", "literal-b"],
  },
  {
    name: "optional primitive",
    table: optionalTable,
    rows: [
      { id: "optional-missing" },
      { id: "optional-2", value: 2n },
      { id: "optional-1", value: 1n },
    ],
    eqValue: 2n,
    eqIds: ["optional-2"],
    scanIds: ["optional-1", "optional-2"],
    range: {
      clauses: [{ gt: [{ col: "value", val: 1n }] }],
      ids: ["optional-2"],
    },
  },
  {
    name: "primitive union",
    table: unionTable,
    rows: [
      { id: "union-string", value: "a" },
      { id: "union-null", value: null },
      { id: "union-number", value: 1 },
      { id: "union-bigint", value: 1n },
      { id: "union-boolean", value: true },
    ],
    eqValue: 1n,
    eqIds: ["union-bigint"],
    scanIds: [
      "union-null",
      "union-bigint",
      "union-boolean",
      "union-number",
      "union-string",
    ],
    range: {
      clauses: [{ gte: [{ col: "value", val: 1n }] }],
      ids: ["union-bigint", "union-boolean", "union-number", "union-string"],
    },
  },
];

const driverFactories: [string, () => Promise<DBDriver>][] = [
  ["SqlDriver", () => initSqlJsWasm()],
  ["BptreeInmemDriver", async () => new BptreeInmemDriver()],
];

describe("runtime index value types", () => {
  for (const [driverName, createDriver] of driverFactories) {
    describe(driverName, () => {
      for (const testCase of cases) {
        it(`indexes and scans ${testCase.name} values`, async () => {
          const db = new SyncDB(new DB(await createDriver()));
          db.loadTables([testCase.table]);
          db.insert(testCase.table, testCase.rows);

          expect(
            db
              .intervalScan(testCase.table, "byValue", [{}])
              .map((row) => row.id),
          ).toEqual(testCase.scanIds);

          const eqClause = [{ eq: [{ col: "value", val: testCase.eqValue }] }];
          expect(
            db
              .intervalScan(testCase.table, "byValue", eqClause)
              .map((row) => row.id),
          ).toEqual(testCase.eqIds);
          expect(
            db
              .intervalScan(testCase.table, "byValueHash", eqClause)
              .map((row) => row.id)
              .sort(),
          ).toEqual([...testCase.eqIds].sort());

          if (testCase.range) {
            expect(
              db
                .intervalScan(testCase.table, "byValue", testCase.range.clauses)
                .map((row) => row.id),
            ).toEqual(testCase.range.ids);
          }
        });
      }

      it("indexes primitive fields from union object variants", async () => {
        const db = new SyncDB(new DB(await createDriver()));
        db.loadTables([unionObjectTable]);
        db.insert(unionObjectTable, [
          {
            id: "task-2",
            type: "task",
            content: "Write tests",
            count: 2,
            unionType: false,
          },
          {
            id: "template-3",
            type: "template",
            template: "Daily review",
            unionType: 3,
          },
          {
            id: "task-1",
            type: "task",
            content: "Ship fix",
            count: 1,
            unionType: true,
          },
          {
            id: "template-4",
            type: "template",
            template: "Weekly plan",
            unionType: 4,
          },
        ]);

        expect(
          db
            .intervalScan(unionObjectTable, "byContent", [{}])
            .map((row) => row.id),
        ).toEqual(["task-1", "task-2"]);

        expect(
          db
            .intervalScan(unionObjectTable, "byContent", [
              { eq: [{ col: "content", val: "Ship fix" }] },
            ])
            .map((row) => row.id),
        ).toEqual(["task-1"]);
        expect(
          db
            .intervalScan(unionObjectTable, "byCount", [
              { gt: [{ col: "count", val: 1 }] },
            ])
            .map((row) => row.id),
        ).toEqual(["task-2"]);
        expect(
          db
            .intervalScan(unionObjectTable, "byTemplate", [
              { eq: [{ col: "template", val: "Daily review" }] },
            ])
            .map((row) => row.id),
        ).toEqual(["template-3"]);
        expect(
          db
            .intervalScan(unionObjectTable, "byUnionType", [{}])
            .map((row) => row.id),
        ).toEqual(["task-2", "task-1", "template-3", "template-4"]);
      });
    });
  }

  it("rejects non-primitive index validators", () => {
    expect(() =>
      defineTable("indexTypesArrayRejected", {
        id: v.string(),
        value: v.array(v.string()),
      }).index("byValue", ["value"] as any),
    ).toThrow(/not comparable/);

    expect(() =>
      defineTable("indexTypesObjectRejected", {
        id: v.string(),
        value: v.object({ tag: v.string() }),
      }).index("byValue", ["value"] as any),
    ).toThrow(/not comparable/);

    expect(() =>
      defineTable("indexTypesRecordRejected", {
        id: v.string(),
        value: v.record(v.string(), v.string()),
      }).index("byValue", ["value"] as any),
    ).toThrow(/not comparable/);

    expect(() =>
      defineTable("indexTypesAnyRejected", {
        id: v.string(),
        value: v.any(),
      }).index("byValue", ["value"] as any),
    ).toThrow(/not comparable/);
  });
});
