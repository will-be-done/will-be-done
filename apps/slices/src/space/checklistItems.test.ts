import { describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  runSelector,
  syncDispatch,
  BptreeInmemDriver,
} from "@will-be-done/hyperdb-lib";

import { dbIdTrait } from "../traits";
import {
  type ChecklistItem,
  checklistItemChildren,
  checklistItemsTable,
  createItem as createChecklistItem,
  toggleChecklistItemState,
} from "./checklistItems";

function createDB() {
  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, [], [dbIdTrait("space", spaceId)]);

  execSync(db.loadTables([checklistItemsTable]));

  return db;
}

function createItem(
  db: DB,
  item: Pick<ChecklistItem, "id" | "state">,
) {
  syncDispatch(
    db,
    createChecklistItem({
      ...item,
      parentId: "task-1",
      parentType: "task",
      content: item.id,
    }),
  );
}

function childIds(db: DB) {
  return runSelector<string[]>(
    db,
    function* () {
      return (yield* checklistItemChildren("task-1", "task")).map(
        (item) => item.id,
      );
    },
    [],
  );
}

describe("checklist item state ordering", () => {
  it("moves a newly done item before the first existing done item", () => {
    const db = createDB();

    createItem(db, { id: "todo-1", state: "todo" });
    createItem(db, { id: "todo-2", state: "todo" });
    createItem(db, { id: "done-1", state: "done" });
    createItem(db, { id: "done-2", state: "done" });

    syncDispatch(db, toggleChecklistItemState("todo-1"));

    expect(childIds(db)).toEqual(["todo-2", "todo-1", "done-1", "done-2"]);
  });

  it("moves a newly done item to the bottom when there are no done siblings", () => {
    const db = createDB();

    createItem(db, { id: "todo-1", state: "todo" });
    createItem(db, { id: "todo-2", state: "todo" });
    createItem(db, { id: "todo-3", state: "todo" });

    syncDispatch(db, toggleChecklistItemState("todo-1"));

    expect(childIds(db)).toEqual(["todo-2", "todo-3", "todo-1"]);
  });
});
