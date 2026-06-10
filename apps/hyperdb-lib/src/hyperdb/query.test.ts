import { assertType, describe, expect, it } from "vitest";
import { table } from "./table";
import { selectFrom, or } from "./query";
import type { ExtractIndexColumns } from "./query";

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

describe("query", () => {
  it("works with limt", () => {
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
      where: [{
        eq: [],
        gte: [],
        gt: [],
        lte: [],
        lt: [],
      }],
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
    assertType<ExtractIndexColumns<typeof tasksTable, "id">>("id");

    // Test valid queries that should compile without errors
    const query1 = selectFrom(tasksTable, "projectIdState").where((q) =>
      q.eq("projectId", "test"),
    );

    const query2 = selectFrom(tasksTable, "projectIdState").where((q) =>
      q.lte("state", "done"),
    );

    const query3 = selectFrom(tasksTable, "id").where((q) => q.eq("id", "123"));

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
});
