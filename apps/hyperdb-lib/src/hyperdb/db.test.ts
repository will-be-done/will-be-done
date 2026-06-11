/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { DB, SyncDB } from "./db.ts";
// import { SqlDriver } from "./drivers/SqlDriver.ts";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver.ts";
import { defineTable } from "./table.ts";
import { v } from "./values.ts";
import { initSqlJsWasm } from "./drivers/initSqlJSWasm.ts";

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

const tasksTable = defineTable("tasks", {
  type: v.literal("task"),
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  lastToggledAt: v.number(),
  projectId: v.string(),
  orderToken: v.string(),
})
  .index("ids", ["id"])
  .index("byTitle", ["title"], { type: "hash" })
  .index("projectIdState", ["projectId", "state", "lastToggledAt"]);

const taskTemplatesTable = defineTable("taskTemplates", {
  type: v.literal("taskTemplate"),
  id: v.string(),
  title: v.string(),
  projectId: v.string(),
  orderToken: v.string(),
  repeatRule: v.string(),
  lastGeneratedAt: v.number(),
})
  .index("ids", ["id"])
  .index("projectId", ["projectId", "orderToken"]);

const writeSemanticsTable = defineTable("writeSemantics", {
  id: v.string(),
  value: v.string(),
  optionalValue: v.optional(v.string()),
});

describe("db", async () => {
  for (const driver of [
    // new InmemDriver(),
    await initSqlJsWasm(),
    new BptreeInmemDriver(),
  ]) {
    it("insert, delete, upsert - " + driver.constructor.name, () => {
      const db = new SyncDB(new DB(driver));
      db.loadTables([tasksTable, taskTemplatesTable]);
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
        db.intervalScan(tasksTable, "ids", [
          {
            eq: [{ col: "id", val: "task-1" }],
          },
        ]),
      ).toEqual([tasks[0]]);

      db.upsert(tasksTable, [updatedTask()]);

      expect(
        db.intervalScan(tasksTable, "ids", [
          {
            eq: [{ col: "id", val: "task-1" }],
          },
        ]),
      ).toEqual([updatedTask()]);

      db.delete(tasksTable, ["task-1"]);

      expect(
        db.intervalScan(tasksTable, "ids", [
          {
            eq: [{ col: "id", val: "task-1" }],
          },
        ]),
      ).toEqual([]);
    });
  }

  for (const driver of [
    await initSqlJsWasm(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    it(
      "insert, upsert, and delete existence semantics - " +
        driver.constructor.name,
      () => {
        const db = new SyncDB(new DB(driver));
        db.loadTables([writeSemanticsTable]);

        const selectById = (id: string) =>
          db.intervalScan(writeSemanticsTable, "byId", [
            {
              eq: [{ col: "id", val: id }],
            },
          ]);

        const initialRecord = {
          id: "existing-record",
          value: "initial",
          optionalValue: "kept only until replacement",
        };

        db.insert(writeSemanticsTable, [initialRecord]);
        expect(selectById(initialRecord.id)).toEqual([initialRecord]);

        expect(() =>
          db.insert(writeSemanticsTable, [
            {
              id: initialRecord.id,
              value: "duplicate insert",
            },
          ]),
        ).toThrow(/duplicate|constraint|unique|exists/i);
        expect(selectById(initialRecord.id)).toEqual([initialRecord]);

        const replacementRecord = {
          id: initialRecord.id,
          value: "replacement",
        };
        db.upsert(writeSemanticsTable, [replacementRecord]);
        expect(selectById(initialRecord.id)).toEqual([replacementRecord]);

        const upsertedRecord = {
          id: "new-from-upsert",
          value: "created by upsert",
        };
        db.upsert(writeSemanticsTable, [upsertedRecord]);
        expect(selectById(upsertedRecord.id)).toEqual([upsertedRecord]);

        db.delete(writeSemanticsTable, [replacementRecord.id]);
        expect(selectById(replacementRecord.id)).toEqual([]);

        expect(() =>
          db.delete(writeSemanticsTable, [
            replacementRecord.id,
            "never-existed",
          ]),
        ).not.toThrow();
        expect(selectById(upsertedRecord.id)).toEqual([upsertedRecord]);
      },
    );
  }

  for (const driver of [
    await initSqlJsWasm(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    it("select multiple rows " + driver.constructor.name, () => {
      const db = new SyncDB(new DB(driver));
      db.loadTables([tasksTable]);

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
        db.intervalScan(tasksTable, "ids", [
          {
            eq: [{ col: "id", val: "task-1" }],
          },
          {
            eq: [{ col: "id", val: "task-2" }],
          },
        ]),
      ).toEqual([tasks[0], tasks[1]]);
    });
  }

  for (const driver of [
    await initSqlJsWasm(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    it("works with hash " + driver.constructor.name, () => {
      const db = new SyncDB(new DB(driver));
      db.loadTables([tasksTable]);

      const justTask: Task = {
        id: "task-1",
        title: "Task 1",
        state: "done",
        projectId: "1",
        orderToken: "b",
        type: "task",
        lastToggledAt: 0,
      };

      const justTask2: Task = {
        id: "task-2",
        title: "Task 1",
        state: "done",
        projectId: "1",
        orderToken: "b",
        type: "task",
        lastToggledAt: 0,
      };

      db.insert(tasksTable, [justTask, justTask2]);
      expect(
        db.intervalScan(tasksTable, "byTitle", [
          {
            lte: [{ col: "title", val: "Task 1" }],
            gte: [{ col: "title", val: "Task 1" }],
          },
        ]),
      ).toEqual([justTask, justTask2]);

      db.upsert(tasksTable, [{ ...justTask2, title: "Task 2" }]);

      expect(
        db.intervalScan(tasksTable, "byTitle", [
          {
            lte: [{ col: "title", val: "Task 1" }],
            gte: [{ col: "title", val: "Task 1" }],
          },
        ]),
      ).toEqual([justTask]);

      db.delete(tasksTable, ["task-1"]);
      expect(
        db.intervalScan(tasksTable, "byTitle", [
          {
            lte: [{ col: "title", val: "Task 1" }],
            gte: [{ col: "title", val: "Task 1" }],
          },
        ]),
      ).toEqual([]);
    });
  }

  // for (const driver of [
  //   await SqlDriver.init(),
  //   // new InmemDriver(),
  //   new BptreeInmemDriver(),
  // ]) {
  //   it(
  //     "doesn't insert duplicate id records - " + driver.constructor.name,
  //     () => {
  //       const justTask: Task = {
  //         id: "task-1",
  //         title: "Task 1",
  //         state: "done",
  //         projectId: "1",
  //         orderToken: "b",
  //         type: "task",
  //         lastToggledAt: 0,
  //       };
  //
  //       const tasks: Task[] = [
  //         {
  //           id: "task-1",
  //           title: "Task 1",
  //           state: "done",
  //           projectId: "1",
  //           orderToken: "b",
  //           type: "task",
  //           lastToggledAt: 0,
  //         },
  //         {
  //           id: "task-1",
  //           title: "Task 2",
  //           state: "todo",
  //           projectId: "1",
  //           orderToken: "b",
  //           type: "task",
  //           lastToggledAt: 1,
  //         },
  //       ];
  //
  //       expect(() => {
  //         const db = new DB(driver, [tasksTable]);
  //         db.insert(tasksTable, tasks);
  //       }).toThrow();
  //
  //       const db = new DB(driver, [tasksTable]);
  //       db.insert(tasksTable, [justTask]);
  //       expect(() => {
  //         db.insert(tasksTable, [justTask]);
  //       }).toThrow();
  //     },
  //   );
  // }

  for (const driver of [
    await initSqlJsWasm(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    it("works with todo app" + driver.constructor.name, () => {
      const db = new SyncDB(new DB(driver));
      db.loadTables([tasksTable, taskTemplatesTable]);

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
            ...db.intervalScan(tasksTable, "ids", [
              { eq: [{ col: "id", val: id }] },
            ]),
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
                eq: [{ col: "id", val: id }],
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
        const templates: TaskTemplate[] = db.intervalScan(
          taskTemplatesTable,
          "projectId",
          [
            {
              eq: [{ col: "projectId", val: projectId }],
            },
          ],
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
        const tasks: Task[] = db.intervalScan(tasksTable, "projectIdState", [
          {
            eq: [
              { col: "projectId", val: projectId },
              { col: "state", val: state },
            ],
          },
        ]);
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
    await initSqlJsWasm(),
    // new InmemDriver(),
    new BptreeInmemDriver(),
  ]) {
    describe(`${driver.constructor.name}`, () => {
      it("should handle empty database scans", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("test", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const results = db.intervalScan(testTable, "byValue", [{}]);
        expect(results).toEqual([]);
      });

      it("works correctly with union document schemas", () => {
        const docsTable = defineTable(
          "unionDocuments",
          v.union(
            v.object({
              id: v.string(),
              kind: v.literal("StringDocument"),
              value: v.string(),
            }),
            v.object({
              id: v.string(),
              kind: v.literal("NumberDocument"),
              value: v.number(),
              someOtherField: v.string(),
            }),
          ),
        );

        const db = new SyncDB(
          new DB(driver, [docsTable], { runtimeValidation: true }),
        );
        db.loadTables([docsTable]);

        const stringDocument = {
          id: "doc-string",
          kind: "StringDocument" as const,
          value: "hello",
        };
        const numberDocument = {
          id: "doc-number",
          kind: "NumberDocument" as const,
          value: 42,
          someOtherField: "hello",
        };

        db.insert(docsTable, [stringDocument, numberDocument]);

        const res = db.intervalScan(docsTable, "byId", [
          {
            eq: [{ col: "id", val: "doc-string" }],
          },
        ]);

        res.forEach((doc) => {
          if (doc.kind === "NumberDocument") {
            expect(doc.someOtherField).toBe("hello");
          }
        });

        expect(
          db.intervalScan(docsTable, "byId", [
            {
              eq: [{ col: "id", val: "doc-string" }],
            },
          ]),
        ).toEqual([stringDocument]);

        const updatedNumberDocument = { ...numberDocument, value: 43 };
        db.upsert(docsTable, [updatedNumberDocument]);

        expect(
          db.intervalScan(docsTable, "byId", [
            {
              eq: [{ col: "id", val: "doc-number" }],
            },
          ]),
        ).toEqual([updatedNumberDocument]);

        expect(() =>
          db.insert(docsTable, [
            {
              id: "doc-invalid",
              kind: "StringDocument",
              value: 123,
            } as any,
          ]),
        ).toThrow(/expected one of union variants/);
      });

      it("skips union rows missing indexed fields while preserving explicit nulls", () => {
        const documentsTable = defineTable(
          "documents",
          v.union(
            v.object({
              id: v.string(),
              type: v.literal("message"),
              body: v.string(),
            }),
            v.object({
              id: v.string(),
              type: v.literal("post"),
              title: v.union(v.string(), v.null()),
              slug: v.string(),
            }),
            v.object({
              id: v.string(),
              type: v.literal("preview"),
              title: v.union(v.string(), v.null()),
            }),
          ),
        )
          .index("byPostTitle", ["title"])
          .index("byPostTitleHash", ["title"], { type: "hash" })
          .index("byPostTitleSlug", ["title", "slug"]);

        const db = new SyncDB(
          new DB(driver, [documentsTable], { runtimeValidation: true }),
        );
        db.loadTables([documentsTable]);

        const messages = Array.from({ length: 50 }, (_, index) => ({
          id: `message-${index}`,
          type: "message" as const,
          body: `No title here ${index}`,
        }));
        const firstPost = {
          id: "post-1",
          type: "post" as const,
          title: "Hello",
          slug: "hello",
        };
        const secondPost = {
          id: "post-2",
          type: "post" as const,
          title: "Later",
          slug: "later",
        };
        const nullTitlePost = {
          id: "post-null",
          type: "post" as const,
          title: null,
          slug: "untitled",
        };
        const preview = {
          id: "preview-1",
          type: "preview" as const,
          title: "Preview",
        };

        db.insert(documentsTable, [
          ...messages,
          firstPost,
          secondPost,
          nullTitlePost,
          preview,
        ]);

        expect(
          db.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: "Hello" }],
            },
          ]),
        ).toEqual([firstPost]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleHash", [
            {
              eq: [{ col: "title", val: "Hello" }],
            },
          ]),
        ).toEqual([firstPost]);

        expect(
          db.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([nullTitlePost]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleHash", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([nullTitlePost]);
        expect(
          db.intervalScan(documentsTable, "byPostTitle", [{}], {
            limit: 3,
          }),
        ).toEqual([nullTitlePost, firstPost, secondPost]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleSlug", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([nullTitlePost]);

        expect(
          db.intervalScan(documentsTable, "byPostTitleSlug", [
            {
              eq: [{ col: "title", val: "Hello" }],
            },
          ]),
        ).toEqual([firstPost]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleSlug", [
            {
              eq: [{ col: "title", val: "Preview" }],
            },
          ]),
        ).toEqual([]);

        const updatedFirstPost = {
          ...firstPost,
          title: "Updated",
          slug: "updated",
        };
        db.upsert(documentsTable, [updatedFirstPost]);

        expect(
          db.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: "Hello" }],
            },
          ]),
        ).toEqual([]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleHash", [
            {
              eq: [{ col: "title", val: "Updated" }],
            },
          ]),
        ).toEqual([updatedFirstPost]);

        const promotedPreview = {
          id: preview.id,
          type: "post" as const,
          title: "Preview",
          slug: "preview",
        };
        db.upsert(documentsTable, [promotedPreview]);

        expect(
          db.intervalScan(documentsTable, "byPostTitleSlug", [
            {
              eq: [{ col: "title", val: "Preview" }],
            },
          ]),
        ).toEqual([promotedPreview]);

        db.delete(documentsTable, [nullTitlePost.id]);

        expect(
          db.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleHash", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([]);
        expect(
          db.intervalScan(documentsTable, "byPostTitleSlug", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([]);

        const tx = db.beginTx();
        const txMessage = {
          id: "tx-message",
          type: "message" as const,
          body: "Still no title",
        };
        const txNullTitlePost = {
          id: "tx-post-null",
          type: "post" as const,
          title: null,
          slug: "tx-untitled",
        };
        tx.insert(documentsTable, [txMessage, txNullTitlePost]);

        expect(
          tx.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([txNullTitlePost]);
        expect(
          tx.intervalScan(documentsTable, "byPostTitleHash", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([txNullTitlePost]);

        tx.delete(documentsTable, [txNullTitlePost.id]);
        expect(
          tx.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([]);
        tx.commit();

        expect(
          db.intervalScan(documentsTable, "byPostTitle", [
            {
              eq: [{ col: "title", val: null }],
            },
          ]),
        ).toEqual([]);
      });

      it("works correctly with string order", () => {
        type TestRecord = { id: string; projectId: string; token: string };
        const testTable = defineTable("testStringOrder", {
          id: v.string(),
          projectId: v.string(),
          token: v.string(),
        }).index("byToken", ["projectId", "token"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const records: TestRecord[] = [
          { id: "1", projectId: "123", token: "a064m" },
          { id: "2", projectId: "123", token: "a3HqIV" },
          { id: "3", projectId: "123", token: "Zs2SG" },
        ];

        db.insert(testTable, records);

        const results = db.intervalScan(testTable, "byToken", [{}]);

        console.log(results);
      });

      it("should handle various scan bound combinations", () => {
        type TestRecord = { id: string; a: number; b: string };
        const testTable = defineTable("testScanBounds", {
          id: v.string(),
          a: v.number(),
          b: v.string(),
        }).index("composite", ["a", "b"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const records: TestRecord[] = [
          { id: "1", a: 1, b: "a" },
          { id: "2", a: 1, b: "b" },
          { id: "3", a: 2, b: "a" },
          { id: "4", a: 2, b: "b" },
          { id: "5", a: 3, b: "a" },
        ];

        db.insert(testTable, records);

        // Test gt
        const gtResults = db.intervalScan(testTable, "composite", [
          {
            gt: [{ col: "a", val: 1 }],
          },
        ]);
        expect(gtResults.length).toBe(3);
        expect(gtResults[0].id).toBe("3");

        // Test gte
        const gteResults = db.intervalScan(testTable, "composite", [
          {
            gte: [
              { col: "a", val: 1 },
              { col: "b", val: "a" },
            ],
            lte: [{ col: "a", val: 1 }],
          },
        ]);
        expect(gteResults.length).toBe(2);
        expect(gteResults[0].id).toBe("1");
        expect(gteResults[1].id).toBe("2");

        // Test lt
        const ltResults = db.intervalScan(testTable, "composite", [
          {
            lt: [{ col: "a", val: 2 }],
          },
        ]);
        expect(ltResults.length).toBe(2);
        // Test lte
        const lteResults = db.intervalScan(testTable, "composite", [
          {
            lte: [
              { col: "a", val: 2 },
              { col: "b", val: "b" },
            ],
            gte: [{ col: "a", val: 2 }],
          },
        ]);
        expect(lteResults.length).toBe(2);

        // Test combined bounds
        const combinedResults = db.intervalScan(testTable, "composite", [
          {
            gte: [{ col: "a", val: 1 }],
            lte: [{ col: "a", val: 1 }],
          },
          {
            gte: [{ col: "a", val: 2 }],
            lte: [{ col: "a", val: 2 }],
          },
        ]);
        expect(combinedResults.map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
      });

      it("should handle limit correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("test3", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const records: TestRecord[] = Array.from({ length: 10 }, (_, i) => ({
          id: i.toString(),
          value: i,
        }));

        db.insert(testTable, records);

        // Test limit without bounds
        const limitResults = db.intervalScan(testTable, "byValue", [{}], {
          limit: 3,
        });
        expect(limitResults.length).toBe(3);

        // Test limit with bounds
        const limitBoundResults = db.intervalScan(
          testTable,
          "byValue",
          [
            {
              gte: [{ col: "value", val: 5 }],
            },
          ],
          { limit: 2 },
        );
        expect(limitBoundResults.length).toBe(2);
        expect(limitBoundResults[0].value).toBe(5);
        expect(limitBoundResults[1].value).toBe(6);

        // Test limit of 0
        const zeroLimitResults = db.intervalScan(testTable, "byValue", [{}], {
          limit: 0,
        });
        expect(zeroLimitResults.length).toBe(0);
      });

      it("should handle explicit index order", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("orderedRecords", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const records: TestRecord[] = Array.from({ length: 9 }, (_, i) => ({
          id: String(i + 1),
          value: i + 1,
        }));

        db.insert(testTable, records);

        expect(
          db
            .intervalScan(testTable, "byValue", [{}])
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(
          db
            .intervalScan(testTable, "byValue", [{}], { order: "asc" })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(
          db
            .intervalScan(testTable, "byValue", [{}], { order: "desc" })
            .map((record) => record.value),
        ).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
        expect(
          db
            .intervalScan(testTable, "byValue", [{}], {
              order: "desc",
              limit: 2,
            })
            .map((record) => record.value),
        ).toEqual([9, 8]);

        const disjointBounds = [
          {
            gte: [{ col: "value", val: 1 }],
            lte: [{ col: "value", val: 3 }],
          },
          {
            gte: [{ col: "value", val: 7 }],
            lte: [{ col: "value", val: 9 }],
          },
        ];

        expect(
          db
            .intervalScan(testTable, "byValue", disjointBounds, {
              order: "desc",
            })
            .map((record) => record.value),
        ).toEqual([9, 8, 7, 3, 2, 1]);
        expect(
          db
            .intervalScan(testTable, "byValue", disjointBounds, {
              order: "desc",
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([9, 8, 7, 3]);
        expect(
          db
            .intervalScan(testTable, "byValue", disjointBounds, {
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 7]);
        expect(
          db
            .intervalScan(testTable, "byValue", [...disjointBounds].reverse(), {
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 7]);

        const overlappingBounds = [
          {
            gte: [{ col: "value", val: 2 }],
            lte: [{ col: "value", val: 5 }],
          },
          {
            gte: [{ col: "value", val: 4 }],
            lte: [{ col: "value", val: 6 }],
          },
        ];

        expect(
          db
            .intervalScan(testTable, "byValue", overlappingBounds)
            .map((record) => record.value),
        ).toEqual([2, 3, 4, 5, 6]);
        expect(
          db
            .intervalScan(testTable, "byValue", overlappingBounds, {
              limit: 3,
            })
            .map((record) => record.value),
        ).toEqual([2, 3, 4]);
        expect(
          db
            .intervalScan(testTable, "byValue", overlappingBounds, {
              order: "desc",
            })
            .map((record) => record.value),
        ).toEqual([6, 5, 4, 3, 2]);
        expect(
          db
            .intervalScan(testTable, "byValue", overlappingBounds, {
              order: "desc",
              limit: 3,
            })
            .map((record) => record.value),
        ).toEqual([6, 5, 4]);
        expect(
          db
            .intervalScan(testTable, "byValue", [
              overlappingBounds[0],
              overlappingBounds[0],
            ])
            .map((record) => record.value),
        ).toEqual([2, 3, 4, 5]);

        const tx = db.beginTx();
        expect(
          tx
            .intervalScan(testTable, "byValue", disjointBounds, {
              order: "desc",
            })
            .map((record) => record.value),
        ).toEqual([9, 8, 7, 3, 2, 1]);
        expect(
          tx
            .intervalScan(testTable, "byValue", disjointBounds, {
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 7]);
        expect(
          tx
            .intervalScan(testTable, "byValue", disjointBounds, {
              order: "desc",
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([9, 8, 7, 3]);
        expect(
          tx
            .intervalScan(testTable, "byValue", [...disjointBounds].reverse(), {
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 7]);
        expect(
          tx
            .intervalScan(testTable, "byValue", overlappingBounds, {
              order: "desc",
            })
            .map((record) => record.value),
        ).toEqual([6, 5, 4, 3, 2]);
        expect(
          tx
            .intervalScan(testTable, "byValue", overlappingBounds, {
              limit: 3,
            })
            .map((record) => record.value),
        ).toEqual([2, 3, 4]);
        expect(
          tx
            .intervalScan(testTable, "byValue", overlappingBounds, {
              order: "desc",
              limit: 3,
            })
            .map((record) => record.value),
        ).toEqual([6, 5, 4]);
        tx.rollback();
      });

      it("should apply OR limits after duplicate range dedupe", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("duplicateRangeRecords", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        db.insert(
          testTable,
          Array.from({ length: 10 }, (_, i) => ({
            id: String(i + 1),
            value: i + 1,
          })),
        );

        const duplicateBounds = [
          {
            gte: [{ col: "value", val: 1 }],
            lte: [{ col: "value", val: 10 }],
          },
          {
            gte: [{ col: "value", val: 1 }],
            lte: [{ col: "value", val: 10 }],
          },
          {
            gte: [{ col: "value", val: 1 }],
            lte: [{ col: "value", val: 10 }],
          },
        ];

        expect(
          db
            .intervalScan(testTable, "byValue", duplicateBounds, { limit: 4 })
            .map((record) => record.value),
        ).toEqual([1, 2, 3, 4]);
        expect(
          db
            .intervalScan(testTable, "byValue", duplicateBounds, {
              order: "desc",
              limit: 4,
            })
            .map((record) => record.value),
        ).toEqual([10, 9, 8, 7]);
      });

      it("should handle open, empty, and unbounded OR ranges", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("orBoundEdgeRecords", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        db.insert(
          testTable,
          Array.from({ length: 9 }, (_, i) => ({
            id: String(i + 1),
            value: i + 1,
          })),
        );

        expect(
          db
            .intervalScan(testTable, "byValue", [
              {
                gt: [{ col: "value", val: 1 }],
                lt: [{ col: "value", val: 4 }],
              },
              {
                gte: [{ col: "value", val: 7 }],
                lte: [{ col: "value", val: 9 }],
              },
            ])
            .map((record) => record.value),
        ).toEqual([2, 3, 7, 8, 9]);
        expect(
          db
            .intervalScan(testTable, "byValue", [
              {
                gte: [{ col: "value", val: 20 }],
                lte: [{ col: "value", val: 30 }],
              },
              {
                gte: [{ col: "value", val: 2 }],
                lte: [{ col: "value", val: 4 }],
              },
            ])
            .map((record) => record.value),
        ).toEqual([2, 3, 4]);
        expect(
          db
            .intervalScan(
              testTable,
              "byValue",
              [
                {
                  gte: [{ col: "value", val: 20 }],
                  lte: [{ col: "value", val: 30 }],
                },
                {
                  gte: [{ col: "value", val: 40 }],
                  lte: [{ col: "value", val: 50 }],
                },
              ],
              { order: "desc" },
            )
            .map((record) => record.value),
        ).toEqual([]);
        if (driver instanceof BptreeInmemDriver) {
          expect(
            db
              .intervalScan(testTable, "byValue", [
                {},
                {
                  gte: [{ col: "value", val: 2 }],
                  lte: [{ col: "value", val: 4 }],
                },
              ])
              .map((record) => record.value),
          ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        }
      });

      it("should merge transaction deletes, updates, and inserts through OR scans", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("txOrMergeRecords", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        db.insert(testTable, [
          { id: "1", value: 1 },
          { id: "2", value: 2 },
          { id: "3", value: 3 },
          { id: "4", value: 4 },
          { id: "5", value: 5 },
          { id: "6", value: 6 },
          { id: "7", value: 7 },
          { id: "9", value: 9 },
        ]);

        const tx = db.beginTx();
        tx.delete(testTable, ["4"]);
        tx.upsert(testTable, [{ id: "3", value: 8 }]);
        tx.insert(testTable, [{ id: "4.5", value: 4.5 }]);

        expect(
          tx
            .intervalScan(testTable, "byValue", [
              {
                gte: [{ col: "value", val: 2 }],
                lte: [{ col: "value", val: 5 }],
              },
              {
                gte: [{ col: "value", val: 4 }],
                lte: [{ col: "value", val: 6 }],
              },
            ])
            .map((record) => record.value),
        ).toEqual([2, 4.5, 5, 6]);
        expect(
          tx
            .intervalScan(testTable, "byValue", [
              {
                gte: [{ col: "value", val: 1 }],
                lte: [{ col: "value", val: 4 }],
              },
              {
                gte: [{ col: "value", val: 7 }],
                lte: [{ col: "value", val: 9 }],
              },
            ])
            .map((record) => record.value),
        ).toEqual([1, 2, 7, 8, 9]);

        tx.rollback();
      });

      it("should keep global OR order for multi-column indexes", () => {
        type ProjectRecord = {
          id: string;
          projectId: string;
          state: number;
        };
        const testTable = defineTable("multiColumnOrRecords", {
          id: v.string(),
          projectId: v.string(),
          state: v.number(),
        }).index("byProjectState", ["projectId", "state"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        db.insert(testTable, [
          { id: "a8", projectId: "a", state: 8 },
          { id: "a9", projectId: "a", state: 9 },
          { id: "a10", projectId: "a", state: 10 },
          { id: "b1", projectId: "b", state: 1 },
          { id: "b2", projectId: "b", state: 2 },
        ]);

        const bounds = [
          {
            eq: [{ col: "projectId", val: "b" }],
            gte: [{ col: "state", val: 1 }],
            lte: [{ col: "state", val: 2 }],
          },
          {
            eq: [{ col: "projectId", val: "a" }],
            gte: [{ col: "state", val: 8 }],
            lte: [{ col: "state", val: 9 }],
          },
          {
            eq: [{ col: "projectId", val: "a" }],
            gte: [{ col: "state", val: 9 }],
            lte: [{ col: "state", val: 10 }],
          },
        ];

        expect(
          db
            .intervalScan(testTable, "byProjectState", bounds)
            .map((record) => `${record.projectId}:${record.state}`),
        ).toEqual(["a:8", "a:9", "a:10", "b:1", "b:2"]);
        expect(
          db
            .intervalScan(testTable, "byProjectState", bounds, {
              order: "desc",
            })
            .map((record) => `${record.projectId}:${record.state}`),
        ).toEqual(["b:2", "b:1", "a:10", "a:9", "a:8"]);
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

        const testTable = defineTable("mixed", {
          id: v.string(),
          nullVal: v.null(),
          intVal: v.number(),
          floatVal: v.number(),
          stringVal: v.string(),
          boolVal: v.boolean(),
        })
          .index("byNull", ["nullVal"])
          .index("byInt", ["intVal"])
          .index("byFloat", ["floatVal"])
          .index("byString", ["stringVal"])
          .index("byBool", ["boolVal"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

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

        expect(db.intervalScan(testTable, "byNull", [{}]).length).toBe(2);
        expect(
          db.intervalScan(testTable, "byInt", [
            { gte: [{ col: "intVal", val: 42 }] },
          ]).length,
        ).toBe(1);
        expect(
          db.intervalScan(testTable, "byFloat", [
            { lt: [{ col: "floatVal", val: 3.5 }] },
          ]).length,
        ).toBe(2);
        expect(
          db.intervalScan(testTable, "byString", [
            { gte: [{ col: "stringVal", val: "hello" }] },
          ]).length,
        ).toBe(2);
        expect(
          db.intervalScan(testTable, "byBool", [
            { gte: [{ col: "boolVal", val: true }] },
          ]).length,
        ).toBe(1);
      });

      it("should throw errors for missing tables and indexes", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("test4", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        expect(() => {
          db.intervalScan(
            { name: "nonexistent", indexes: {} } as any,
            "byValue",
            [{}],
          );
        }).toThrow();

        expect(() => {
          db.intervalScan(testTable, "nonexistent" as any, [{}]);
        }).toThrow();
      });

      it("should handle duplicate values correctly", () => {
        type TestRecord = { id: string; value: number };
        const testTable = defineTable("test6", {
          id: v.string(),
          value: v.number(),
        }).index("byValue", ["value"]);

        const db = new SyncDB(new DB(driver));
        db.loadTables([testTable]);

        const records: TestRecord[] = [
          { id: "1", value: 5 },
          { id: "2", value: 5 },
          { id: "3", value: 5 },
        ];

        db.insert(testTable, records);

        const results = db.intervalScan(testTable, "byValue", [
          { eq: [{ col: "value", val: 5 }] },
        ]);
        expect(results.length).toBe(3);
      });
    });
  }
});
