import { assertType, describe, expect, it } from "vitest";
import { defineTable, type ExtractSchema } from "../../schema/table";
import { selectFrom, or } from "./builder";
import type { ExtractIndexColumns } from "./builder";
import { v } from "../../schema/values";

const typeCheckOnly = false as boolean;

const tasksTable = defineTable("tasks", {
  type: v.literal("task"),
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done"), v.number()),
  projectId: v.string(),
  orderToken: v.string(),
}).index("projectIdState", ["projectId", "state"]);

describe("query", () => {
  it("works with limit", () => {
    const result1 = selectFrom(tasksTable, "projectIdState")
      .where((q) =>
        or(q.eq("projectId", "1").lte("state", "done"), q.eq("projectId", "2")),
      )
      .limit(10)
      .toQuery();

    const result2 = selectFrom(tasksTable, "projectIdState")
      .limit(10)
      .where((q) =>
        or(q.eq("projectId", "1").lte("state", "done"), q.eq("projectId", "2")),
      )
      .toQuery();

    for (const result of [result1, result2]) {
      expect(result).toEqual({
        from: tasksTable,
        index: "projectIdState",
        limit: 10,
        where: [
          {
            eq: [
              {
                col: "projectId",
                val: "1",
              },
            ],
            gte: [],
            gt: [],
            lte: [
              {
                col: "state",
                val: "done",
              },
            ],
            lt: [],
          },
          {
            eq: [
              {
                col: "projectId",
                val: "2",
              },
            ],
            gte: [],
            gt: [],
            lte: [],
            lt: [],
          },
        ],
      });
    }
  });

  it("works with order", () => {
    const result1 = selectFrom(tasksTable, "projectIdState")
      .order("desc")
      .where((q) => q.eq("projectId", "1"))
      .limit(5)
      .toQuery();

    const result2 = selectFrom(tasksTable, "projectIdState")
      .where((q) => q.eq("projectId", "1"))
      .limit(5)
      .order("desc")
      .toQuery();

    for (const result of [result1, result2]) {
      expect(result).toEqual({
        from: tasksTable,
        index: "projectIdState",
        limit: 5,
        order: "desc",
        where: [
          {
            eq: [
              {
                col: "projectId",
                val: "1",
              },
            ],
            gte: [],
            gt: [],
            lte: [],
            lt: [],
          },
        ],
      });
    }

    if (typeCheckOnly) {
      assertType(
        selectFrom(tasksTable, "projectIdState")
          // @ts-expect-error order only supports asc or desc
          .order("newest"),
      );
    }
  });

  it("supports limit and order from any query builder stage", () => {
    const expectedWhere = [
      {
        eq: [
          {
            col: "projectId",
            val: "1",
          },
        ],
        gte: [],
        gt: [],
        lte: [],
        lt: [],
      },
    ];

    const queries = [
      selectFrom(tasksTable, "projectIdState").order("asc").limit(3).toQuery(),
      selectFrom(tasksTable, "projectIdState").limit(3).order("asc").toQuery(),
      selectFrom(tasksTable, "projectIdState")
        .order("asc")
        .limit(3)
        .where((q) => q.eq("projectId", "1"))
        .toQuery(),
      selectFrom(tasksTable, "projectIdState")
        .limit(3)
        .order("asc")
        .where((q) => q.eq("projectId", "1"))
        .toQuery(),
      selectFrom(tasksTable, "projectIdState")
        .where((q) => q.eq("projectId", "1"))
        .order("asc")
        .limit(3)
        .toQuery(),
      selectFrom(tasksTable, "projectIdState")
        .where((q) => q.eq("projectId", "1"))
        .limit(3)
        .order("asc")
        .toQuery(),
    ];

    expect(queries[0]).toMatchObject({
      from: tasksTable,
      index: "projectIdState",
      limit: 3,
      order: "asc",
    });
    expect(queries[1]).toMatchObject({
      from: tasksTable,
      index: "projectIdState",
      limit: 3,
      order: "asc",
    });

    for (const query of queries.slice(2)) {
      expect(query).toEqual({
        from: tasksTable,
        index: "projectIdState",
        limit: 3,
        order: "asc",
        where: expectedWhere,
      });
    }
  });

  it("keeps limit with or queries", () => {
    const result = selectFrom(tasksTable, "projectIdState")
      .where((q) =>
        or(
          q.eq("projectId", "1").lte("state", 3),
          q.eq("projectId", "1").gte("state", 7),
        ),
      )
      .limit(4)
      .toQuery();

    expect(result.limit).toBe(4);
    expect(result.where).toHaveLength(2);
  });

  it("returns the first row as a terminal query helper", () => {
    const task: ExtractSchema<typeof tasksTable> = {
      type: "task",
      id: "task-1",
      title: "Task 1",
      state: "todo",
      projectId: "project-1",
      orderToken: "a",
    };

    const gen = selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", "task-1"))
      .first();
    const cmdResult = gen.next();

    expect(cmdResult.done).toBe(false);
    expect(cmdResult.value).toMatchObject({
      type: "selectRange",
      selectQuery: {
        from: tasksTable,
        index: "byId",
        limit: 1,
      },
    });

    const result = gen.next([task]);
    expect(result.done).toBe(true);
    expect(result.value).toEqual(task);
  });

  it("forces limit 1 when first is called", () => {
    const gen = selectFrom(tasksTable, "projectIdState")
      .limit(10)
      .where((q) => q.eq("projectId", "project-1"))
      .first();
    const cmdResult = gen.next();

    expect(cmdResult.value).toMatchObject({
      type: "selectRange",
      selectQuery: {
        limit: 1,
      },
    });
  });

  it("returns undefined from first when the query is empty", () => {
    const gen = selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", "missing-task"))
      .first();

    gen.next();

    const result = gen.next([]);
    expect(result.done).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("returns a fallback from firstOr when the query is empty", () => {
    const fallback = null;
    const gen = selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", "missing-task"))
      .firstOr(fallback);

    gen.next();

    const result = gen.next([]);
    expect(result.done).toBe(true);
    expect(result.value).toBe(fallback);
  });

  it("supports first and firstOr without a where clause", () => {
    const firstQuery = selectFrom(tasksTable, "projectIdState").first();
    const firstCmdResult = firstQuery.next();

    expect(firstCmdResult.value).toMatchObject({
      type: "selectRange",
      selectQuery: {
        limit: 1,
        where: [
          {
            eq: [],
            gte: [],
            gt: [],
            lte: [],
            lt: [],
          },
        ],
      },
    });

    const firstOrQuery = selectFrom(tasksTable, "projectIdState").firstOr(
      "fallback",
    );
    const firstOrCmdResult = firstOrQuery.next();

    expect(firstOrCmdResult.value).toMatchObject({
      type: "selectRange",
      selectQuery: {
        limit: 1,
      },
    });
  });

  it("works", () => {
    const result = selectFrom(tasksTable, "projectIdState")
      .where((q) =>
        or(q.eq("projectId", "1").lte("state", "done"), q.eq("projectId", "2")),
      )
      .toQuery();

    expect(result).toEqual({
      from: tasksTable,
      index: "projectIdState",
      where: [
        {
          eq: [
            {
              col: "projectId",
              val: "1",
            },
          ],
          gte: [],
          gt: [],
          lte: [
            {
              col: "state",
              val: "done",
            },
          ],
          lt: [],
        },
        {
          eq: [
            {
              col: "projectId",
              val: "2",
            },
          ],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ],
    });
  });

  it("works without calling where", () => {
    const result = selectFrom(tasksTable, "projectIdState").toQuery();

    expect(result).toEqual({
      from: tasksTable,
      index: "projectIdState",
      where: [
        {
          eq: [],
          gte: [],
          gt: [],
          lte: [],
          lt: [],
        },
      ],
      limit: undefined,
    });
  });

  it("validates correct types for index columns", () => {
    // Test that the extracted column types are correct
    assertType<ExtractIndexColumns<typeof tasksTable, "projectIdState">>(
      "projectId",
    );
    assertType<ExtractIndexColumns<typeof tasksTable, "projectIdState">>(
      "state",
    );

    // Test that the hash index only has the id column
    assertType<ExtractIndexColumns<typeof tasksTable, "byId">>("id");

    // Test valid queries that should compile without errors
    const query1 = selectFrom(tasksTable, "projectIdState").where((q) =>
      q.eq("projectId", "test"),
    );

    const query2 = selectFrom(tasksTable, "projectIdState").where((q) =>
      q.lte("state", "done"),
    );

    const query3 = selectFrom(tasksTable, "byId").where((q) =>
      q.eq("id", "123"),
    );

    expect(query1).toBeDefined();
    expect(query2).toBeDefined();
    expect(query3).toBeDefined();
  });

  it("enforces type safety - only allows columns from the specified index", () => {
    // This should work - projectId and state are in the projectIdState index
    const validQuery = selectFrom(tasksTable, "projectIdState").where((q) =>
      q.eq("projectId", "1").lte("state", "done"),
    );

    expect(validQuery).toBeDefined();

    // Test various invalid column names that should cause TypeScript errors
    assertType(
      selectFrom(tasksTable, "projectIdState").where(
        // @ts-expect-error "title" is not in the projectIdState index
        (q) => q.eq("title", "test"),
      ),
    );

    assertType(
      selectFrom(tasksTable, "projectIdState").where(
        // @ts-expect-error "orderToken" is not in the projectIdState index
        (q) => q.eq("orderToken", "abc"),
      ),
    );

    assertType(
      selectFrom(tasksTable, "projectIdState").where(
        // @ts-expect-error "type" is not in the projectIdState index
        (q) => q.lte("type", "task"),
      ),
    );

    assertType(
      selectFrom(tasksTable, "projectIdState").where(
        // @ts-expect-error "id" is not in the projectIdState index
        (q) => q.gt("id", "123"),
      ),
    );

    // Test that chaining with invalid columns also fails
    assertType(
      selectFrom(tasksTable, "projectIdState").where(
        // @ts-expect-error "title" is not in the projectIdState index
        (q) => q.eq("projectId", "1").eq("title", "test"),
      ),
    );

    // Test that or() with invalid columns also fails
    assertType(
      selectFrom(tasksTable, "projectIdState").where((q) =>
        or(
          q.eq("projectId", "1"),
          // @ts-expect-error "title" is not in the projectIdState index
          q.eq("title", "test"),
        ),
      ),
    );
  });

  it("does not allow undefined query filter values", () => {
    const optionalTable = defineTable("optionalTasks", {
      id: v.string(),
      title: v.string(),
      archivedAt: v.optional(v.number()),
    }).index("byArchivedAt", ["archivedAt"]);

    if (typeCheckOnly) {
      assertType(
        selectFrom(optionalTable, "byArchivedAt").where(
          // @ts-expect-error query filters cannot use undefined for missing fields
          (q) => q.eq("archivedAt", undefined),
        ),
      );
    }

    expect(() =>
      selectFrom(optionalTable, "byArchivedAt").where((q) =>
        q.eq("archivedAt", undefined as never),
      ),
    ).toThrow(/Query filters do not support undefined values/);

    const query = selectFrom(optionalTable, "byArchivedAt")
      .where((q) => q.eq("archivedAt", 10))
      .toQuery();

    expect(query.where[0].eq).toEqual([{ col: "archivedAt", val: 10 }]);
  });

  it("types first and firstOr as terminal query helpers", () => {
    function* firstTask() {
      const task = yield* selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", "task-1"))
        .first();

      assertType<ExtractSchema<typeof tasksTable> | undefined>(task);

      return task;
    }

    function* firstTaskOrNull() {
      const task = yield* selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", "task-1"))
        .firstOr(null);

      assertType<ExtractSchema<typeof tasksTable> | null>(task);

      return task;
    }

    expect(firstTask()).toBeDefined();
    expect(firstTaskOrNull()).toBeDefined();
  });
});
