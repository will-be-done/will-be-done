/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  DB,
  SyncDB,
  execSync,
  type DBDriver,
  type DBDriverTX,
  type Row,
  type SelectOptions,
  type WhereClause,
} from "./db";
import type { DBCmd } from "./generators";
import { defineTable, type TableDefinition } from "./table";
import { v } from "./values";
import { initSqlJsWasm } from "./drivers/initSqlJSWasm";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { insert as actionInsert, syncDispatch } from "./action";

class RecordingDriver implements DBDriver, DBDriverTX {
  inserted: Row[][] = [];
  updated: Row[][] = [];
  scanRows: unknown[] = [];

  *loadTables(_tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {}

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    return this;
  }

  *intervalScan(
    _table: string,
    _indexName: string,
    _clauses: WhereClause[],
    _selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    return this.scanRows;
  }

  *insert(_tableName: string, values: Row[]): Generator<DBCmd, void> {
    this.inserted.push(values);
  }

  *update(_tableName: string, values: Row[]): Generator<DBCmd, void> {
    this.updated.push(values);
  }

  *delete(_tableName: string, _values: string[]): Generator<DBCmd, void> {}

  *commit(): Generator<DBCmd, void> {}

  *rollback(): Generator<DBCmd, void> {}
}

const docsTable = defineTable("docs", {
  id: v.string(),
  title: v.string(),
  optionalNote: v.optional(v.string()),
  payload: v.any(),
}).index("byTitle", ["title"]);

const scanAll = [
  {
    eq: [{ col: "title", val: "hello" }],
  },
];

describe("DB runtime validation and codec boundary", () => {
  it("validates writes before the driver sees them when runtime validation is enabled", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: true });

    expect(() =>
      execSync(
        db.insert(docsTable, [
          {
            id: "doc-1",
            title: 123,
            payload: null,
          } as any,
        ]),
      ),
    ).toThrow(/Table docs record doc-1: expected string at title/);

    expect(driver.inserted).toEqual([]);
  });

  it("skips schema validation when disabled while preserving codec normalization", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: false });

    execSync(
      db.insert(docsTable, [
        {
          id: "doc-1",
          title: 123,
          optionalNote: undefined,
          payload: null,
        } as any,
      ]),
    );

    expect(driver.inserted).toEqual([
      [
        {
          id: "doc-1",
          title: 123,
          payload: null,
        },
      ],
    ]);
  });

  it("rejects invalid codec values even when schema validation is disabled", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: false });

    expect(() =>
      execSync(
        db.insert(docsTable, [
          {
            id: "doc-1",
            title: "hello",
            payload: ["ok", undefined],
          } as any,
        ]),
      ),
    ).toThrow(/undefined is not a valid stored value at payload\[1\]/);

    expect(driver.inserted).toEqual([]);
  });

  it("validates records after driver reads when runtime validation is enabled", () => {
    const driver = new RecordingDriver();
    driver.scanRows = [{ id: "doc-1", title: 123, payload: null }];
    const db = new DB(driver, [docsTable], { runtimeValidation: true });

    expect(() => execSync(db.intervalScan(docsTable, "byTitle", scanAll))).toThrow(
      /Table docs record doc-1: expected string at title/,
    );
  });

  it("decodes driver records before returning them and before read validation", () => {
    const driver = new RecordingDriver();
    const bytes = new Uint8Array([1, 2, 3]);
    const buffer = new Uint8Array([4, 5]).buffer;
    const db = new DB(driver, [docsTable], { runtimeValidation: true });

    execSync(
      db.insert(docsTable, [
        {
          id: "doc-1",
          title: "hello",
          payload: {
            count: 10n,
            bytes,
            buffer,
          },
        },
      ]),
    );
    driver.scanRows = driver.inserted[0];

    const [record] = execSync(db.intervalScan(docsTable, "byTitle", scanAll));

    expect(record.payload.count).toBe(10n);
    expect(record.payload.bytes).toEqual(bytes);
    expect(new Uint8Array(record.payload.buffer)).toEqual(
      new Uint8Array(buffer),
    );
  });

  it("applies write validation through transactions", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: true });
    const tx = execSync(db.beginTx());

    expect(() =>
      execSync(
        tx.update(docsTable, [
          {
            id: "doc-1",
            title: "hello",
            optionalNote: 123,
            payload: null,
          } as any,
        ]),
      ),
    ).toThrow(/Table docs record doc-1: expected string at optionalNote/);

    expect(driver.updated).toEqual([]);
    execSync(tx.rollback());
  });

  it("applies write validation through action dispatch", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: true });

    function* writeInvalidDoc() {
      yield* actionInsert(docsTable, [
        {
          id: "doc-1",
          title: false,
          payload: null,
        } as any,
      ]);
    }

    expect(() => syncDispatch(db, writeInvalidDoc())).toThrow(
      /Table docs record doc-1: expected string at title/,
    );
    expect(driver.inserted).toEqual([]);
  });


  it("treats empty write batches as no-ops", () => {
    const driver = new RecordingDriver();
    const db = new DB(driver, [docsTable], { runtimeValidation: true });

    execSync(db.insert(docsTable, []));
    execSync(db.update(docsTable, []));

    expect(driver.inserted).toEqual([]);
    expect(driver.updated).toEqual([]);
  });

  for (const [name, driverFactory] of [
    ["SqlDriver", () => initSqlJsWasm()],
    ["BptreeInmemDriver", async () => new BptreeInmemDriver()],
  ] as const) {
    it(`round-trips encoded rich document values through ${name}`, async () => {
      const driver = await driverFactory();
      const db = new SyncDB(new DB(driver, [docsTable], { runtimeValidation: true }));
      db.loadTables([docsTable]);

      const bytes = new Uint8Array([8, 9, 10]);
      const buffer = new Uint8Array([11, 12]).buffer;

      db.insert(docsTable, [
        {
          id: "doc-1",
          title: "hello",
          payload: {
            big: 9007199254740993n,
            bytes,
            buffer,
          },
        },
      ]);

      const [record] = db.intervalScan(docsTable, "byTitle", scanAll);

      expect(record.payload.big).toBe(9007199254740993n);
      expect(record.payload.bytes).toEqual(bytes);
      expect(new Uint8Array(record.payload.buffer)).toEqual(
        new Uint8Array(buffer),
      );
    });
  }
});
