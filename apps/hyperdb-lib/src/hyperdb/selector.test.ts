import { describe, expect, test } from "vitest";
import { DB, execSync } from "./db";
import { runQuery, selector, initSelector } from "./selector";
import { SubscribableDB } from "./subscribable-db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { defineTable } from "./table";
import { selectFrom } from "./query";
import { v } from "./values";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = defineTable("tasks", {
  type: v.literal("task"),
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
  orderToken: v.string(),
}).index("projectIdState", ["projectId", "state"]);

const driver = new BptreeInmemDriver();
const db = new SubscribableDB(new DB(driver));
execSync(db.loadTables([tasksTable]));

const allTasks = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "projectIdState").where((q) =>
      q.eq("projectId", "1"),
    ),
  );

  return tasks;
});

const justSelector = selector(function () {
  return "just selector";
});

const allDoneTasks = selector(function* (state: Task["state"]) {
  const tasks = yield* allTasks();

  console.log("justSelector", yield* justSelector());

  return tasks.filter((task) => task.state === state);
});

const specificTask = selector(function* (id: string) {
  const tasks = yield* selectFrom(tasksTable, "byId").where((q) =>
    q.eq("id", id),
  );
  return tasks[0];
});

describe("selector", () => {
  test("works with range", () => {
    const selector = initSelector(db, () => allDoneTasks("done"));

    const results = [selector.getSnapshot()?.[0]?.id];
    selector.subscribe(() => {
      console.log("new tasks!", selector.getSnapshot());
      results.push(selector.getSnapshot()?.[0]?.id);
    });

    execSync(
      db.insert(tasksTable, [
        {
          id: "task-1",
          title: "inserted",
          state: "done",
          projectId: "1",
          orderToken: "d",
          type: "task",
        },
      ]),
    );

    execSync(
      db.upsert(tasksTable, [
        {
          id: "task-1",
          title: "updated",
          state: "todo",
          projectId: "2",
          orderToken: "d",
          type: "task",
        },
      ]),
    );

    execSync(db.delete(tasksTable, ["task-1"]));

    expect(results).toEqual([undefined, "task-1", undefined]);
  });

  test("works with equal", () => {
    const selector = initSelector(db, () => specificTask("task-1"));

    console.log("current state", selector.getSnapshot());
    selector.subscribe(() => {
      console.log("new state!", selector.getSnapshot());
    });

    execSync(
      db.insert(tasksTable, [
        {
          id: "task-1",
          title: "inserted",
          state: "done",
          projectId: "1",
          orderToken: "d",
          type: "task",
        },
      ]),
    );

    execSync(
      db.upsert(tasksTable, [
        {
          id: "task-1",
          title: "updated",
          state: "todo",
          projectId: "2",
          orderToken: "d",
          type: "task",
        },
      ]),
    );

    execSync(db.delete(tasksTable, ["task-1"]));
  });

  test("selector subscription with projectId btree index", () => {
    type Item = {
      id: string;
      orderToken: string;
      projectId: string;
    };

    const itemsTable = defineTable("items", {
      id: v.string(),
      orderToken: v.string(),
      projectId: v.string(),
    }).index("projectIdOrder", ["projectId", "orderToken"]);

    const testDb = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(testDb.loadTables([itemsTable]));

    const project1Selector = selector(function* () {
      const items = yield* runQuery(
        selectFrom(itemsTable, "projectIdOrder").where((q) =>
          q.eq("projectId", "project1"),
        ),
      );
      return items;
    });

    const project2Selector = selector(function* () {
      const items = yield* runQuery(
        selectFrom(itemsTable, "projectIdOrder").where((q) =>
          q.eq("projectId", "project2"),
        ),
      );
      return items;
    });

    const selector1 = initSelector(testDb, () => project1Selector());
    const selector2 = initSelector(testDb, () => project2Selector());

    const project1Results: Item[][] = [selector1.getSnapshot()];
    const project2Results: Item[][] = [selector2.getSnapshot()];

    selector1.subscribe(() => {
      project1Results.push(selector1.getSnapshot());
    });

    selector2.subscribe(() => {
      project2Results.push(selector2.getSnapshot());
    });

    const tx = execSync(testDb.beginTx());

    execSync(
      tx.insert(itemsTable, [
        { id: "item1", orderToken: "a", projectId: "project1" },
        { id: "item2", orderToken: "b", projectId: "project1" },
      ]),
    );

    execSync(tx.commit());

    expect(project1Results).toHaveLength(2);
    expect(project2Results).toHaveLength(1);
    expect(project1Results[1]).toHaveLength(2);
    expect(project2Results[0]).toHaveLength(0);

    const tx2 = execSync(testDb.beginTx());
    execSync(
      tx2.upsert(itemsTable, [
        { id: "item1", orderToken: "c", projectId: "project2" },
      ]),
    );
    execSync(tx2.commit());

    expect(project1Results).toHaveLength(3);
    expect(project2Results).toHaveLength(2);
    expect(project1Results[2]).toHaveLength(1);
    expect(project2Results[1]).toHaveLength(1);
  });

  test("selector preserves query order after rerun", () => {
    type Item = {
      id: string;
      orderToken: string;
      projectId: string;
    };

    const itemsTable = defineTable("orderedSelectorItems", {
      id: v.string(),
      orderToken: v.string(),
      projectId: v.string(),
    }).index("projectIdOrder", ["projectId", "orderToken"]);

    const testDb = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(testDb.loadTables([itemsTable]));
    execSync(
      testDb.insert(itemsTable, [
        { id: "one", orderToken: "a", projectId: "project1" },
        { id: "three", orderToken: "c", projectId: "project1" },
        { id: "two", orderToken: "b", projectId: "project1" },
      ]),
    );

    const orderedSelector = selector(function* () {
      const items = yield* runQuery(
        selectFrom(itemsTable, "projectIdOrder")
          .where((q) => q.eq("projectId", "project1"))
          .order("desc"),
      );
      return items;
    });

    const initializedSelector = initSelector(testDb, () => orderedSelector());
    const snapshots: string[][] = [];
    initializedSelector.subscribe(() => {
      snapshots.push(initializedSelector.getSnapshot().map((item) => item.id));
    });

    expect(initializedSelector.getSnapshot().map((item) => item.id)).toEqual([
      "three",
      "two",
      "one",
    ]);

    execSync(
      testDb.upsert(itemsTable, [
        { id: "one", orderToken: "d", projectId: "project1" },
      ]),
    );

    expect(initializedSelector.getSnapshot().map((item) => item.id)).toEqual([
      "one",
      "three",
      "two",
    ]);
    expect(snapshots).toEqual([["one", "three", "two"]]);
  });
});
