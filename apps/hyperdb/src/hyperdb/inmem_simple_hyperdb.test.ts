import { describe, expect, it } from "vitest";
import {
  DB,
  InmemDriver,
  SqlDriver,
  table,
  compareTuple,
  compareValue,
  encodingTypeOf,
  MIN,
  MAX,
  UnreachableError,
} from "./inmem_simple_hyperdb";

export const fractionalCompare = <T extends { id: string; orderToken: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.orderToken === item2.orderToken) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.orderToken > item2.orderToken ? 1 : -1;
};
describe("InmemDB", async () => {
  for (const driver of [await SqlDriver.init(), new InmemDriver()]) {
    it("works with todo app" + driver.constructor.name, () => {
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

      const tasksTable = table<Task>("tasks", {
        ids: { cols: ["id"] },
        projectIdState: { cols: ["projectId", "state", "lastToggledAt"] },
      });

      const taskTemplatesTable = table<TaskTemplate>("taskTemplates", {
        ids: { cols: ["id"] },
        projectId: { cols: ["projectId", "orderToken"] },
      });

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
          tasks.push(...db.scan(tasksTable, "ids", { gte: [id], lte: [id] }));
        }

        return tasks;
      };

      const templateByIds = function (ids: string[]) {
        const templates: TaskTemplate[] = [];

        for (const id of ids) {
          templates.push(
            ...db.scan(taskTemplatesTable, "ids", { gte: [id], lte: [id] }),
          );
        }

        return templates;
      };

      const templateChildrenIds = function (
        projectId: string,
        alwaysIncludeChildIds: string[] = [],
      ) {
        const templates: TaskTemplate[] = Array.from(
          db.scan(taskTemplatesTable, "projectId", {
            lte: [projectId],
            gte: [projectId],
          }),
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
          db.scan(tasksTable, "projectIdState", {
            lte: [projectId, state],
            gte: [projectId, state],
          }),
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

describe("Value and Tuple Comparison Edge Cases", () => {
  describe("encodingTypeOf", () => {
    it("should correctly identify encoding types", () => {
      expect(encodingTypeOf(null)).toBe("null");
      expect(encodingTypeOf(true)).toBe("integer");
      expect(encodingTypeOf(false)).toBe("integer");
      expect(encodingTypeOf(42)).toBe("integer");
      expect(encodingTypeOf(3.14)).toBe("float");
      expect(encodingTypeOf("hello")).toBe("string");
      expect(encodingTypeOf(MIN)).toBe("virtual");
      expect(encodingTypeOf(MAX)).toBe("virtual");
    });

    it("should throw for unknown types", () => {
      expect(() => encodingTypeOf({} as any)).toThrow(UnreachableError);
      expect(() => encodingTypeOf([] as any)).toThrow(UnreachableError);
      expect(() => encodingTypeOf(undefined as any)).toThrow(UnreachableError);
    });
  });

  describe("compareValue", () => {
    it("should compare same types correctly", () => {
      expect(compareValue(1, 2)).toBe(-1);
      expect(compareValue(2, 1)).toBe(1);
      expect(compareValue(1, 1)).toBe(0);

      expect(compareValue(1.5, 2.5)).toBe(-1);
      expect(compareValue(2.5, 1.5)).toBe(1);
      expect(compareValue(1.5, 1.5)).toBe(0);

      expect(compareValue("a", "b")).toBe(-1);
      expect(compareValue("b", "a")).toBe(1);
      expect(compareValue("a", "a")).toBe(0);

      expect(compareValue(true, false)).toBe(1);
      expect(compareValue(false, true)).toBe(-1);
      expect(compareValue(true, true)).toBe(0);

      expect(compareValue(null, null)).toBe(0);
    });

    it("should handle MIN/MAX comparisons", () => {
      expect(compareValue(1, MIN)).toBe(1);
      expect(compareValue("hello", MIN)).toBe(1);
      expect(compareValue(null, MIN)).toBe(1);

      expect(compareValue(1, MAX)).toBe(-1);
      expect(compareValue("hello", MAX)).toBe(-1);
      expect(compareValue(null, MAX)).toBe(-1);
    });

    it("should compare different types by encoding rank", () => {
      // null < integer < float < string
      expect(compareValue(null, 1)).toBe(-1);
      expect(compareValue(1, null)).toBe(1);

      expect(compareValue(1, 1.5)).toBe(-1);
      expect(compareValue(1.5, 1)).toBe(1);

      expect(compareValue(1.5, "a")).toBe(-1);
      expect(compareValue("a", 1.5)).toBe(1);

      expect(compareValue(null, "a")).toBe(-1);
      expect(compareValue("a", null)).toBe(1);
    });

    it("should throw for virtual values", () => {
      expect(() => compareValue(MIN, MAX)).toThrow(
        "Cannot save virtual values into tuple",
      );
    });
  });

  describe("compareTuple", () => {
    it("should compare tuples of same length", () => {
      expect(compareTuple([1, 2], [1, 3])).toBe(-1);
      expect(compareTuple([1, 3], [1, 2])).toBe(1);
      expect(compareTuple([1, 2], [1, 2])).toBe(0);

      expect(compareTuple([1, 2], [2, 1])).toBe(-1);
      expect(compareTuple([2, 1], [1, 2])).toBe(1);
    });

    it("should compare tuples of different lengths", () => {
      expect(compareTuple([1], [1, 2])).toBe(-1);
      expect(compareTuple([1, 2], [1])).toBe(1);
      expect(compareTuple([1, 2], [1, 2, 3])).toBe(-1);
      expect(compareTuple([1, 2, 3], [1, 2])).toBe(1);
    });

    it("should handle empty tuples", () => {
      expect(compareTuple([], [])).toBe(0);
      expect(compareTuple([], [1])).toBe(-1);
      expect(compareTuple([1], [])).toBe(1);
    });

    it("should handle mixed types in tuples", () => {
      expect(compareTuple([null, 1], [null, "a"])).toBe(-1);
      expect(compareTuple([1, "a"], [1, null])).toBe(1);
      expect(compareTuple(["a", 1], [null, 1])).toBe(1);
    });

    it("should handle MIN/MAX in comparisons", () => {
      // Test that compareValue handles MIN/MAX correctly when used as bounds
      expect(compareValue(1, MIN)).toBe(1);
      expect(compareValue(1, MAX)).toBe(-1);
      expect(compareValue("hello", MIN)).toBe(1);
      expect(compareValue("hello", MAX)).toBe(-1);

      // Virtual values throw when both are virtual
      expect(() => compareValue(MIN, MAX)).toThrow(
        "Cannot save virtual values into tuple",
      );
      expect(() => compareValue(MAX, MIN)).toThrow(
        "Cannot save virtual values into tuple",
      );

      // But MIN/MAX vs regular values work for bounds
      expect(compareTuple([1, 0], [1, null])).toBe(1); // 0 > null in encoding order
      expect(compareTuple([null, 1], [1, null])).toBe(-1); // null < 1 in encoding order
    });
  });
});

describe("Database Operations Edge Cases", async () => {
  for (const driver of [new InmemDriver(), await SqlDriver.init()]) {
    describe(`${driver.constructor.name}`, () => {
      it("should handle empty database scans", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test", {
          byValue: { cols: ["value"] },
        });

        const db = new DB(driver, [testTable]);

        const results = Array.from(db.scan(testTable, "byValue"));
        expect(results).toEqual([]);
      });

      it("should handle various scan bound combinations", () => {
        type TestRecord = { id: string; a: number; b: string };
        const testTable = table<TestRecord>("test2", {
          composite: { cols: ["a", "b"] },
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
          db.scan(testTable, "composite", { gt: [1, "a"] }),
        );
        expect(gtResults.length).toBe(4);
        expect(gtResults[0].id).toBe("2");

        // Test gte
        const gteResults = Array.from(
          db.scan(testTable, "composite", { gte: [1, "a"] }),
        );
        expect(gteResults.length).toBe(5);
        expect(gteResults[0].id).toBe("1");

        // Test lt
        const ltResults = Array.from(
          db.scan(testTable, "composite", { lt: [2, "b"] }),
        );
        expect(ltResults.length).toBe(3);

        // Test lte
        const lteResults = Array.from(
          db.scan(testTable, "composite", { lte: [2, "b"] }),
        );
        expect(lteResults.length).toBe(4);

        // Test combined bounds
        const combinedResults = Array.from(
          db.scan(testTable, "composite", {
            gte: [1, "b"],
            lte: [2, "a"],
          }),
        );
        expect(combinedResults.length).toBe(2);
        expect(combinedResults.map((r) => r.id)).toEqual(["2", "3"]);
      });

      it("should handle limit correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test3", {
          byValue: { cols: ["value"] },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = Array.from({ length: 10 }, (_, i) => ({
          id: i.toString(),
          value: i,
        }));

        db.insert(testTable, records);

        // Test limit without bounds
        const limitResults = Array.from(
          db.scan(testTable, "byValue", { limit: 3 }),
        );
        expect(limitResults.length).toBe(3);

        // Test limit with bounds
        const limitBoundResults = Array.from(
          db.scan(testTable, "byValue", {
            gte: [5],
            limit: 2,
          }),
        );
        expect(limitBoundResults.length).toBe(2);
        expect(limitBoundResults[0].value).toBe(5);
        expect(limitBoundResults[1].value).toBe(6);

        // Test limit of 0
        const zeroLimitResults = Array.from(
          db.scan(testTable, "byValue", { limit: 0 }),
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

        const testTable = table<MixedRecord>("mixed", {
          byNull: { cols: ["nullVal"] },
          byInt: { cols: ["intVal"] },
          byFloat: { cols: ["floatVal"] },
          byString: { cols: ["stringVal"] },
          byBool: { cols: ["boolVal"] },
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

        expect(Array.from(db.scan(testTable, "byNull")).length).toBe(2);
        expect(
          Array.from(db.scan(testTable, "byInt", { gte: [42] })).length,
        ).toBe(1);
        expect(
          Array.from(db.scan(testTable, "byFloat", { lt: [3.5] })).length,
        ).toBe(2);
        expect(
          Array.from(db.scan(testTable, "byString", { gte: ["hello"] })).length,
        ).toBe(2);
        expect(
          Array.from(db.scan(testTable, "byBool", { gte: [true] })).length,
        ).toBe(1);
      });

      it("should throw errors for missing tables and indexes", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test4", {
          byValue: { cols: ["value"] },
        });

        const db = new DB(driver, [testTable]);

        expect(() => {
          Array.from(
            db.scan({ name: "nonexistent", indexes: {} } as any, "byValue"),
          );
        }).toThrow();

        expect(() => {
          Array.from(db.scan(testTable, "nonexistent" as any));
        }).toThrow();
      });

      it("should handle partial tuple bounds normalization", () => {
        type TestRecord = { id: string; a: number; b: string; c: boolean };
        const testTable = table<TestRecord>("test5", {
          triple: { cols: ["a", "b", "c"] },
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
          db.scan(testTable, "triple", { gte: [1] }),
        );
        expect(partialResults.length).toBe(3);

        const partialResults2 = Array.from(
          db.scan(testTable, "triple", { gte: [1, "b"] }),
        );
        expect(partialResults2.length).toBe(2);
      });

      it("should handle duplicate values correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = table<TestRecord>("test6", {
          byValue: { cols: ["value"] },
        });

        const db = new DB(driver, [testTable]);

        const records: TestRecord[] = [
          { id: "1", value: 5 },
          { id: "2", value: 5 },
          { id: "3", value: 5 },
        ];

        db.insert(testTable, records);

        const results = Array.from(
          db.scan(testTable, "byValue", { gte: [5], lte: [5] }),
        );
        expect(results.length).toBe(3);
      });
    });
  }
});
