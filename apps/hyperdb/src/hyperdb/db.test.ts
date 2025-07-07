/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { DB } from "./db.ts";
// import { SqlDriver } from "./drivers/SqlDriver.ts";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver.ts";
import { table } from "./table.ts";
import { SqlDriver } from "./drivers/SqlDriver.ts";

export const fractionalCompare = <T extends { id: string; orderToken: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.orderToken === item2.orderToken) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.orderToken > item2.orderToken ? 1 : -1;
};
type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  lastToggledAt: number;
  projectId: string;
  orderToken: string;
};
type TaskTemplate = {
  type: "taskTemplate";
  id: string;
  title: string;
  projectId: string;
  orderToken: string;
  repeatRule: string;
  lastGeneratedAt: number;
};

const tasksTable = table<Task>("tasks").withIndexes({
  id: { cols: ["id"], type: "hash" },
  ids: { cols: ["id"], type: "btree" },
  projectIdState: {
    cols: ["projectId", "state", "lastToggledAt"],
    type: "btree",
  },
});

const taskTemplatesTable = table<TaskTemplate>("taskTemplates").withIndexes({
  id: { cols: ["id"], type: "hash" },
  ids: { cols: ["id"], type: "btree" },
  projectId: { cols: ["projectId", "orderToken"], type: "btree" },
});

describe("db", async () => {
  for (const driver of [
    // new InmemDriver(),
    await SqlDriver.init(),
    new BptreeInmemDriver(),
  ]) {
    it("insert, delete, update - " + driver.constructor.name, () => {
      const db = new DB(driver, [tasksTable, taskTemplatesTable]);
      const updatedTask = (): Task => ({
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
        lastToggledAt: 0,
      });

      const tasks: Task[] = [
        {
          id: "task-1",
          title: "Task 1",
          state: "done",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 0,
        },
        {
          id: "task-2",
          title: "Task 2",
          state: "todo",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 1,
        },
      ];
      db.insert(tasksTable, tasks);

      expect(
        Array.from(
          db.intervalScan(tasksTable, "ids", [
            {
              gte: ["task-1"],
              lte: ["task-1"],
            },
          ]),
        ),
      ).toEqual([tasks[0]]);

      db.update(tasksTable, [updatedTask()]);

      expect(
        Array.from(
          db.intervalScan(tasksTable, "ids", [
            {
              gte: ["task-1"],
              lte: ["task-1"],
            },
          ]),
        ),
      ).toEqual([updatedTask()]);

      db.delete(tasksTable, ["task-1"]);

      expect(
        Array.from(
          db.intervalScan(tasksTable, "ids", [
            {
              gte: ["task-1"],
              lte: ["task-1"],
            },
          ]),
        ),
      ).toEqual([]);
    });
  }

  for (const driver of [
    await SqlDriver.init(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    // TODO: return back
    it.skip(
      "doesn't insert duplicate id records - " + driver.constructor.name,
      () => {
        const justTask: Task = {
          id: "task-1",
          title: "Task 1",
          state: "done",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 0,
        };

        const tasks: Task[] = [
          {
            id: "task-1",
            title: "Task 1",
            state: "done",
            projectId: "1",
            orderToken: "b",
            type: "task",
            lastToggledAt: 0,
          },
          {
            id: "task-1",
            title: "Task 2",
            state: "todo",
            projectId: "1",
            orderToken: "b",
            type: "task",
            lastToggledAt: 1,
          },
        ];

        expect(() => {
          const db = new DB(driver, [tasksTable]);
          db.insert(tasksTable, tasks);
        }).toThrow();

        const db = new DB(driver, [tasksTable]);
        db.insert(tasksTable, [justTask]);
        expect(() => {
          db.insert(tasksTable, [justTask]);
        }).toThrow();
      },
    );
  }

  for (const driver of [
    await SqlDriver.init(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    it("works with todo app" + driver.constructor.name, () => {
      const db = new DB(driver, [tasksTable, taskTemplatesTable]);

      const tasks: Task[] = [
        {
          id: "task-1",
          title: "Task 1",
          state: "done",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 0,
        },
        {
          id: "task-2",
          title: "Task 2",
          state: "todo",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 1,
        },
        {
          id: "task-3",
          title: "Task 2",
          state: "done",
          projectId: "1",
          orderToken: "c",
          type: "task",
          lastToggledAt: 2,
        },
        {
          id: "task-4",
          title: "Task 2",
          state: "todo",
          projectId: "2",
          orderToken: "b",
          type: "task",
          lastToggledAt: 3,
        },
      ];
      db.insert(tasksTable, tasks);

      const templates: TaskTemplate[] = [
        {
          id: "template-1",
          title: "Template 1",
          projectId: "1",
          orderToken: "h",
          type: "taskTemplate",
          lastGeneratedAt: 0,
          repeatRule: "RRULE:FREQ=DAILY;BYHOUR=10",
        },
        {
          id: "template-2",
          title: "Template 2",
          projectId: "1",
          orderToken: "i",
          type: "taskTemplate",
          lastGeneratedAt: 1,
          repeatRule: "RRULE:FREQ=DAILY;BYHOUR=10",
        },
      ];

      db.insert(taskTemplatesTable, templates);

      const taskByIds = function (ids: string[]) {
        const tasks: Task[] = [];

        for (const id of ids) {
          tasks.push(
            ...db.intervalScan(tasksTable, "ids", [{ gte: [id], lte: [id] }]),
          );
        }

        return tasks;
      };

      const templateByIds = function (ids: string[]) {
        const templates: TaskTemplate[] = [];

        for (const id of ids) {
          templates.push(
            ...db.intervalScan(taskTemplatesTable, "ids", [
              {
                gte: [id],
                lte: [id],
              },
            ]),
          );
        }

        return templates;
      };

      const templateChildrenIds = function (
        projectId: string,
        alwaysIncludeChildIds: string[] = [],
      ) {
        const templates: TaskTemplate[] = Array.from(
          db.intervalScan(taskTemplatesTable, "projectId", [
            {
              lte: [projectId],
              gte: [projectId],
            },
          ]),
        );

        if (alwaysIncludeChildIds.length > 0) {
          templates.push(...templateByIds(alwaysIncludeChildIds));
        }

        return templates;
      };

      const taskWithStateChildrenIds = function (
        projectId: string,
        state: "todo" | "done",
        alwaysIncludeTaskIds: string[] = [],
      ) {
        const tasks: Task[] = Array.from(
          db.intervalScan(tasksTable, "projectIdState", [
            {
              lte: [projectId, state],
              gte: [projectId, state],
            },
          ]),
        );
        tasks.push(...taskByIds(alwaysIncludeTaskIds));
        return tasks;
      };

      const childrenIds = function (
        projectId: string,
        alwaysIncludeChildIds: string[] = [],
      ) {
        const todoTasks = taskWithStateChildrenIds(
          projectId,
          "todo",
          alwaysIncludeChildIds,
        );
        const templates = templateChildrenIds(projectId, alwaysIncludeChildIds);

        return [...todoTasks, ...templates]
          .sort(fractionalCompare)
          .map((p) => p.id);
      };

      expect(taskWithStateChildrenIds("1", "done", [])).toEqual([
        tasks[0],
        tasks[2],
      ]);
      expect(taskWithStateChildrenIds("1", "done", ["task-4"])).toEqual([
        tasks[0],
        tasks[2],
        tasks[3],
      ]);

      expect(childrenIds("1", [])).toEqual([
        "task-2",
        "template-1",
        "template-2",
      ]);
    });
  }
});

describe("Database Operations Edge Cases", async () => {
  for (const driver of [
    // new InmemDriver(),
    await SqlDriver.init(),
    new BptreeInmemDriver(),
  ]) {
    describe(`${driver.constructor.name}`, () => {
      it("should handle empty database scans", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test").withIndexes({
          id: { cols: ["id"], type: "hash" },
          byValue: { cols: ["value"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const results = Array.from(db.intervalScan(testTable, "byValue", [{}]));
        expect(results).toEqual([]);
      });

      it("should handle various scan bound combinations", () => {
        type TestRecord = { id: string; a: number; b: string };
        const testTable = table<TestRecord>("test2").withIndexes({
          id: { cols: ["id"], type: "hash" },
          composite: { cols: ["a", "b"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = [
          { id: "1", a: 1, b: "a" },
          { id: "2", a: 1, b: "b" },
          { id: "3", a: 2, b: "a" },
          { id: "4", a: 2, b: "b" },
          { id: "5", a: 3, b: "a" },
        ];

        db.insert(testTable, records);

        // Test gt
        const gtResults = Array.from(
          db.intervalScan(testTable, "composite", [{ gt: [1, "a"] }]),
        );
        expect(gtResults.length).toBe(4);
        expect(gtResults[0].id).toBe("2");

        // Test gte
        const gteResults = Array.from(
          db.intervalScan(testTable, "composite", [{ gte: [1, "a"] }]),
        );
        expect(gteResults.length).toBe(5);
        expect(gteResults[0].id).toBe("1");

        // Test lt
        const ltResults = Array.from(
          db.intervalScan(testTable, "composite", [{ lt: [2, "b"] }]),
        );
        expect(ltResults.length).toBe(3);

        // Test lte
        const lteResults = Array.from(
          db.intervalScan(testTable, "composite", [{ lte: [2, "b"] }]),
        );
        expect(lteResults.length).toBe(4);

        // Test combined bounds
        const combinedResults = Array.from(
          db.intervalScan(testTable, "composite", [
            {
              gte: [1, "b"],
              lte: [2, "a"],
            },
            {
              gte: [2, "b"],
              lte: [3, "a"],
            },
          ]),
        );
        expect(combinedResults.length).toBe(4);
        expect(combinedResults.map((r) => r.id)).toEqual(["2", "3", "4", "5"]);
      });

      it("should handle limit correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test3").withIndexes({
          id: { cols: ["id"], type: "hash" },
          byValue: { cols: ["value"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = Array.from({ length: 10 }, (_, i) => ({
          id: i.toString(),
          value: i,
        }));

        db.insert(testTable, records);

        // Test limit without bounds
        const limitResults = Array.from(
          db.intervalScan(testTable, "byValue", [{}], { limit: 3 }),
        );
        expect(limitResults.length).toBe(3);

        // Test limit with bounds
        const limitBoundResults = Array.from(
          db.intervalScan(
            testTable,
            "byValue",
            [
              {
                gte: [5],
              },
            ],
            { limit: 2 },
          ),
        );
        expect(limitBoundResults.length).toBe(2);
        expect(limitBoundResults[0].value).toBe(5);
        expect(limitBoundResults[1].value).toBe(6);

        // Test limit of 0
        const zeroLimitResults = Array.from(
          db.intervalScan(testTable, "byValue", [{}], { limit: 0 }),
        );
        expect(zeroLimitResults.length).toBe(0);
      });

      it("should handle all value types in indexes", () => {
        type MixedRecord = {
          id: string;
          nullVal: null;
          intVal: number;
          floatVal: number;
          stringVal: string;
          boolVal: boolean;
        };

        const testTable = table<MixedRecord>("mixed").withIndexes({
          id: { cols: ["id"], type: "hash" },
          byNull: { cols: ["nullVal"], type: "btree" },
          byInt: { cols: ["intVal"], type: "btree" },
          byFloat: { cols: ["floatVal"], type: "btree" },
          byString: { cols: ["stringVal"], type: "btree" },
          byBool: { cols: ["boolVal"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const records: MixedRecord[] = [
          {
            id: "1",
            nullVal: null,
            intVal: 42,
            floatVal: 3.14,
            stringVal: "hello",
            boolVal: true,
          },
          {
            id: "2",
            nullVal: null,
            intVal: 1,
            floatVal: 2.71,
            stringVal: "world",
            boolVal: false,
          },
        ];

        db.insert(testTable, records);

        expect(
          Array.from(db.intervalScan(testTable, "byNull", [{}])).length,
        ).toBe(2);
        expect(
          Array.from(db.intervalScan(testTable, "byInt", [{ gte: [42] }]))
            .length,
        ).toBe(1);
        expect(
          Array.from(db.intervalScan(testTable, "byFloat", [{ lt: [3.5] }]))
            .length,
        ).toBe(2);
        expect(
          Array.from(
            db.intervalScan(testTable, "byString", [{ gte: ["hello"] }]),
          ).length,
        ).toBe(2);
        expect(
          Array.from(db.intervalScan(testTable, "byBool", [{ gte: [true] }]))
            .length,
        ).toBe(1);
      });

      it("should throw errors for missing tables and indexes", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test4").withIndexes({
          id: { cols: ["id"], type: "hash" },
          byValue: { cols: ["value"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        expect(() => {
          Array.from(
            db.intervalScan(
              { name: "nonexistent", indexes: {} } as any,
              "byValue",
              [{}],
            ),
          );
        }).toThrow();

        expect(() => {
          Array.from(db.intervalScan(testTable, "nonexistent" as any, [{}]));
        }).toThrow();
      });

      it("should handle partial tuple bounds normalization", () => {
        type TestRecord = { id: string; a: number; b: string; c: boolean };
        const testTable = table<TestRecord>("test5").withIndexes({
          id: { cols: ["id"], type: "hash" },
          triple: { cols: ["a", "b", "c"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = [
          { id: "1", a: 1, b: "a", c: true },
          { id: "2", a: 1, b: "b", c: false },
          { id: "3", a: 2, b: "a", c: true },
        ];

        db.insert(testTable, records);

        // Test partial bounds - should work with shorter tuples
        const partialResults = Array.from(
          db.intervalScan(testTable, "triple", [{ gte: [1] }]),
        );
        expect(partialResults.length).toBe(3);

        const partialResults2 = Array.from(
          db.intervalScan(testTable, "triple", [{ gte: [1, "b"] }]),
        );
        expect(partialResults2.length).toBe(2);
      });

      it("should handle duplicate values correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test6").withIndexes({
          id: { cols: ["id"], type: "hash" },
          byValue: { cols: ["value"], type: "btree" },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = [
          { id: "1", value: 5 },
          { id: "2", value: 5 },
          { id: "3", value: 5 },
        ];

        db.insert(testTable, records);

        const results = Array.from(
          db.intervalScan(testTable, "byValue", [{ gte: [5], lte: [5] }]),
        );
        expect(results.length).toBe(3);
      });
    });
  }
});
