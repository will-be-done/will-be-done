import { describe, expect, test } from "vitest";
import { DB } from "./db";
import { runQuery, selector, initSelector } from "./selector";
import { SubscribableDB } from "./subscribable-db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { table } from "./table";
import { selectFrom } from "./query";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks").withIndexes({
  id: { cols: ["id"], type: "hash" },
  projectIdState: { cols: ["projectId", "state"], type: "btree" },
});

const driver = new BptreeInmemDriver();
export const db = new SubscribableDB(new DB(driver, [tasksTable]));

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
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "id").where((q) => q.eq("id", id)),
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

    db.insert(tasksTable, [
      {
        id: "task-1",
        title: "inserted",
        state: "done",
        projectId: "1",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.update(tasksTable, [
      {
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.delete(tasksTable, ["task-1"]);

    expect(results).toEqual([undefined, "task-1", undefined]);
  });

  test("works with equal", () => {
    const selector = initSelector(db, () => specificTask("task-1"));

    console.log("current state", selector.getSnapshot());
    selector.subscribe(() => {
      console.log("new state!", selector.getSnapshot());
    });

    db.insert(tasksTable, [
      {
        id: "task-1",
        title: "inserted",
        state: "done",
        projectId: "1",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.update(tasksTable, [
      {
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.delete(tasksTable, ["task-1"]);
  });

  test("selector subscription with projectId btree index", () => {
    type Item = {
      id: string;
      orderToken: string;
      projectId: string;
    };

    const itemsTable = table<Item>("items").withIndexes({
      id: { cols: ["id"], type: "hash" },
      projectIdOrder: { cols: ["projectId", "orderToken"], type: "btree" },
    });

    const testDb = new SubscribableDB(
      new DB(new BptreeInmemDriver(), [itemsTable]),
    );

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

    const tx = testDb.beginTx();

    tx.insert(itemsTable, [
      { id: "item1", orderToken: "a", projectId: "project1" },
      { id: "item2", orderToken: "b", projectId: "project1" },
    ]);

    tx.commit();

    expect(project1Results).toHaveLength(2);
    expect(project2Results).toHaveLength(1);
    expect(project1Results[1]).toHaveLength(2);
    expect(project2Results[0]).toHaveLength(0);

    const tx2 = testDb.beginTx();
    tx2.update(itemsTable, [
      { id: "item1", orderToken: "c", projectId: "project2" },
    ]);
    tx2.commit();

    expect(project1Results).toHaveLength(3);
    expect(project2Results).toHaveLength(2);
    expect(project1Results[2]).toHaveLength(1);
    expect(project2Results[1]).toHaveLength(1);
  });
});
