import { test } from "vitest";
import {
  AsyncCursorDB,
  createTable,
  doneChildrenIds,
  doneChildrenIdsWithYieldStar,
  run,
  runAsync,
  SyncCursorDB,
} from "./effect";

type Task = {
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
};

test("works with todo app", () => {
  const tasksTable = createTable<Task>("tasks");

  // With sync DB
  const syncDB = new SyncCursorDB([tasksTable]);
  syncDB.insert(tasksTable, {
    id: "1",
    title: "Task 1",
    state: "done",
    projectId: "1",
  });

  const syncResult = run(doneChildrenIds(syncDB, tasksTable, "1", []));
  console.log("Sync result:", syncResult);

  // Test with yield* effect() syntax
  const yieldStarResult = run(doneChildrenIdsWithYieldStar(syncDB, tasksTable, "1", []));
  console.log("Yield* result:", yieldStarResult);

  // With async DB
  const asyncDB = new AsyncCursorDB();
  const asyncResult = runAsync(doneChildrenIds(asyncDB, tasksTable, "1", []));
  asyncResult.then((result) => console.log("Async result:", result));
});
