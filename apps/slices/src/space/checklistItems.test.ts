import { describe, expect, it } from "vitest";
import {
  DB,
  createSelector,
  execSync,
  selectSync,
  syncDispatch,
  type SelectorGenerator,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import {
  checklistItemChildren,
  createItem as createChecklistItem,
  toggleChecklistItemState,
} from "./checklistItems";
import { ChecklistItem, checklistItemsTable } from "./tables";

const selector = createSelector();

function runSelector<T>(
  db: DB,
  handler: () => SelectorGenerator<T>,
  _deps: unknown[],
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

function createDB() {
  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, { traits: [dbIdTrait("space", spaceId)] });

  execSync(db.loadTables([checklistItemsTable]));

  return db;
}

function createItem(db: DB, item: Pick<ChecklistItem, "id" | "state">) {
  syncDispatch(
    db,
    createChecklistItem({
      item: {
        ...item,
        parentId: "task-1",
        parentType: "task",
        content: item.id,
      },
    }),
  );
}

function childIds(db: DB) {
  return runSelector<string[]>(
    db,
    function* () {
      return (yield* checklistItemChildren({
        parentId: "task-1",
        parentType: "task",
      })).map((item) => item.id);
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

    syncDispatch(db, toggleChecklistItemState({ id: "todo-1" }));

    expect(childIds(db)).toEqual(["todo-2", "todo-1", "done-1", "done-2"]);
  });

  it("moves a newly done item to the bottom when there are no done siblings", () => {
    const db = createDB();

    createItem(db, { id: "todo-1", state: "todo" });
    createItem(db, { id: "todo-2", state: "todo" });
    createItem(db, { id: "todo-3", state: "todo" });

    syncDispatch(db, toggleChecklistItemState({ id: "todo-1" }));

    expect(childIds(db)).toEqual(["todo-2", "todo-3", "todo-1"]);
  });
});
