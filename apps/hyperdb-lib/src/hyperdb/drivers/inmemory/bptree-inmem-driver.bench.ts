import { bench, describe } from "vitest";
import { BptreeInmemDriver } from "./bptree-inmem-driver";
import { defineTable } from "../../schema/table";
import { v } from "../../schema/values";
import type { Row } from "../../core/primitives";

const rowCount = 2_000;
const tasksTable = defineTable("benchTasks", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
  order: v.number(),
})
  .index("projectStateOrder", ["projectId", "state", "order"])
  .index("title", ["title"]);

const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({
  id: `task-${i}`,
  title: `Task ${i % 256}`,
  state: i % 3 === 0 ? "done" : "todo",
  projectId: `project-${i % 64}`,
  order: i,
}));

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
});
