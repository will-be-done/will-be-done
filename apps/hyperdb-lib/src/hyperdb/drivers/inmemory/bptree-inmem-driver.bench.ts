import { bench, describe } from "vitest";
import { BptreeInmemDriver } from "./bptree-inmem-driver";
import { defineTable } from "../../schema/table";
import { v } from "../../schema/values";
import type { Row, ScanValue, Value, WhereClause } from "../../core/primitives";
import { InMemoryBinaryPlusTree } from "../../structures/bptree";
import { compareTuple } from "../../core/query/tuple";

const rowCount = 2_000;
const preloadCount = 1_000;
const hashPreloadCount = 10_000;
const tasksTable = defineTable("benchTasks", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
  order: v.number(),
})
  .index("projectStateOrder", ["projectId", "state", "order"])
  .index("title", ["title"]);

const makeRows = (count: number, offset: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `task-${offset + i}`,
    title: `Task ${(offset + i) % 256}`,
    state: (offset + i) % 3 === 0 ? "done" : "todo",
    projectId: `project-${(offset + i) % 64}`,
    order: offset + i,
  }));

const rows = makeRows(rowCount, preloadCount);
const preloadRows = makeRows(preloadCount, 0);
const hashPreloadRows = makeRows(hashPreloadCount, 0);
const hashWriteRows = makeRows(1, hashPreloadCount);
const scanClauses: WhereClause[] = [
  {
    eq: [
      { col: "projectId", val: "project-1" },
      { col: "state", val: "todo" },
    ],
  },
];

const projectStateOrderKey = (row: Row): ScanValue[] => [
  row.projectId as ScanValue,
  row.state as ScanValue,
  row.order as ScanValue,
  row.id,
];
const titleKey = (row: Row): ScanValue[] => [
  row.title as ScanValue,
  row.id,
];
const keyFns = [projectStateOrderKey, titleKey];

const runGenerator = <T>(generator: Generator<unknown, T>): T => {
  let step = generator.next();
  while (!step.done) {
    step = generator.next();
  }
  return step.value;
};

const createLoadedDriver = () => {
  const driver = new BptreeInmemDriver();
  runGenerator(driver.loadTables([tasksTable]));
  return driver;
};

const createRawTrees = () =>
  keyFns.map(
    () => new InMemoryBinaryPlusTree<ScanValue[], Row>(64, 128, compareTuple),
  );

const insertRawTrees = (
  trees: InMemoryBinaryPlusTree<ScanValue[], Row>[],
  insertRows: Row[],
) => {
  for (const row of insertRows) {
    for (let i = 0; i < trees.length; i++) {
      trees[i].set(keyFns[i](row), row);
    }
  }
};

const createRawHashRecords = (insertRows: Row[]) => {
  const records = new Map<Value, Map<string, Row>>();

  for (const row of insertRows) {
    const value = row.id;
    const rows = records.get(value);

    if (rows) {
      rows.set(row.id, row);
    } else {
      records.set(value, new Map([[row.id, row]]));
    }
  }

  return records;
};

let _driverSink: unknown;

describe("BptreeInmemDriver insert", () => {
  bench(
    `bulk insert ${rowCount} rows with two btree indexes`,
    () => {
      const driver = createLoadedDriver();
      runGenerator(driver.insert(tasksTable.tableName, rows));
      _driverSink = driver;
    },
    { time: 1000 },
  );

  bench(
    `transaction insert ${rowCount} rows with two btree indexes`,
    () => {
      const driver = createLoadedDriver();
      const tx = runGenerator(driver.beginTx());
      runGenerator(tx.insert(tasksTable.tableName, rows));
      runGenerator(tx.commit());
      _driverSink = driver;
    },
    { time: 1000 },
  );

  bench(
    `transaction insert, scan, commit ${rowCount} rows with two btree indexes`,
    () => {
      const driver = createLoadedDriver();
      const tx = runGenerator(driver.beginTx());
      runGenerator(tx.insert(tasksTable.tableName, rows));
      _driverSink = runGenerator(
        tx.intervalScan(
          tasksTable.tableName,
          "projectStateOrder",
          scanClauses,
          { limit: 50 },
        ),
      );
      runGenerator(tx.commit());
      _driverSink = driver;
    },
    { time: 1000 },
  );
});

describe("BptreeInmemDriver hash transaction index strategy", () => {
  bench(
    `legacy eager hash tx clone/write ${hashPreloadCount} buckets`,
    () => {
      const originalRecords = createRawHashRecords(hashPreloadRows);
      const txRecords = new Map(
        Array.from(originalRecords, ([value, rows]) => [
          value,
          new Map(rows),
        ]),
      );

      for (const row of hashWriteRows) {
        txRecords.set(row.id, new Map([[row.id, row]]));
      }

      _driverSink = txRecords;
    },
    { time: 1000 },
  );

  bench(
    `touched-bucket hash tx write/commit ${hashPreloadCount} buckets`,
    () => {
      const originalRecords = createRawHashRecords(hashPreloadRows);
      const txBuckets = new Map<Value, Map<string, Row>>();

      for (const row of hashWriteRows) {
        const value = row.id;
        const rows = txBuckets.get(value);

        if (rows) {
          rows.set(row.id, row);
        } else {
          const originalRows = originalRecords.get(value);
          txBuckets.set(
            value,
            originalRows
              ? new Map(originalRows).set(row.id, row)
              : new Map([[row.id, row]]),
          );
        }
      }

      for (const [value, rows] of txBuckets) {
        if (rows.size === 0) originalRecords.delete(value);
        else originalRecords.set(value, rows);
      }

      _driverSink = originalRecords;
    },
    { time: 1000 },
  );
});

describe("BptreeInmemDriver transaction index strategy", () => {
  bench(
    `legacy overlay-style btree tx insert/commit ${rowCount} rows`,
    () => {
      const originalTrees = createRawTrees();
      insertRawTrees(originalTrees, preloadRows);

      const setTrees = createRawTrees();
      insertRawTrees(setTrees, rows);

      for (let i = 0; i < originalTrees.length; i++) {
        for (const entry of setTrees[i].iterate()) {
          originalTrees[i].set(entry.key, entry.value);
        }
      }

      _driverSink = originalTrees;
    },
    { time: 1000 },
  );

  bench(
    `forked btree tx insert/commit ${rowCount} rows`,
    () => {
      const originalTrees = createRawTrees();
      insertRawTrees(originalTrees, preloadRows);

      const txTrees = originalTrees.map((tree) => tree.fork());
      insertRawTrees(txTrees, rows);

      _driverSink = txTrees;
    },
    { time: 1000 },
  );
});
