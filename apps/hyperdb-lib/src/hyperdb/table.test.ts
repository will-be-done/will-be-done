/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertType, describe, expect, it } from "vitest";
import { selectFrom } from "./query";
import { defineTable, table, type ExtractSchema } from "./table";
import { v } from "./values";

describe("defineTable", () => {
  it("infers table schemas from validators and preserves query ergonomics", () => {
    const projectCategoriesTable = defineTable("projectCategories", {
      id: v.string(),
      projectId: v.string(),
      orderToken: v.string(),
      name: v.string(),
      archived: v.optional(v.boolean()),
    }).index("byProjectIdOrderToken", ["projectId", "orderToken"]);

    assertType<ExtractSchema<typeof projectCategoriesTable>>({
      id: "category-1",
      projectId: "project-1",
      orderToken: "a0",
      name: "Inbox",
    });

    const projectIds = ["project-1", "project-2"];
    const query = selectFrom(
      projectCategoriesTable,
      "byProjectIdOrderToken",
    )
      .where((q) => projectIds.map((id) => q.eq("projectId", id)))
      .toQuery();

    expect(query.index).toBe("byProjectIdOrderToken");
    expect(query.where).toEqual([
      {
        eq: [{ col: "projectId", val: "project-1" }],
        gt: [],
        gte: [],
        lt: [],
        lte: [],
      },
      {
        eq: [{ col: "projectId", val: "project-2" }],
        gt: [],
        gte: [],
        lt: [],
        lte: [],
      },
    ]);
  });

  it("requires id at type level and runtime table creation", () => {
    if (false) {
      assertType(
        // @ts-expect-error defineTable schemas must include id
        defineTable("missingId", {
          name: v.string(),
        }),
      );
    }

    expect(() =>
      defineTable("missingId", {
        name: v.string(),
      } as any),
    ).toThrow(/schema must include an id field/);
  });

  it("type-checks index columns against document fields", () => {
    const tasksTable = defineTable("tasks", {
      id: v.string(),
      projectId: v.string(),
      state: v.union(v.literal("todo"), v.literal("done")),
      title: v.string(),
    }).index("byProjectState", ["projectId", "state"]);

    expect(tasksTable.indexes.byProjectState.cols).toEqual([
      "projectId",
      "state",
    ]);

    if (false) {
      assertType(
        tasksTable.index(
          "bad",
          // @ts-expect-error titleOnly is not a field
          ["titleOnly"],
        ),
      );
    }
  });

  it("rejects invalid schema/index keys and non-comparable index fields", () => {
    expect(() =>
      defineTable("$bad", {
        id: v.string(),
      }),
    ).toThrow(/keys cannot be empty or start with \$/);

    expect(() =>
      defineTable("badField", {
        id: v.string(),
        $bad: v.string(),
      } as any),
    ).toThrow(/keys cannot be empty or start with \$/);

    expect(() =>
      defineTable("badIndex", {
        id: v.string(),
        tags: v.array(v.string()),
      }).index("byTags", ["tags"] as any),
    ).toThrow(/not SQLite-comparable/);

    if (false) {
      const richTable = defineTable("rich", {
        id: v.string(),
        title: v.string(),
        tags: v.array(v.string()),
      });

      assertType(
        richTable.index(
          "byTags",
          // @ts-expect-error arrays are document values, not index values
          ["tags"],
        ),
      );
    }
  });

  it("keeps the old phantom table API compatible", () => {
    type Task = {
      id: string;
      projectId: string;
      title: string;
    };

    const tasksTable = table<Task>("tasks").withIndexes({
      id: { cols: ["id"], type: "hash" },
      byProjectId: { cols: ["projectId"], type: "btree" },
    });

    const query = selectFrom(tasksTable, "byProjectId")
      .where((q) => q.eq("projectId", "project-1"))
      .toQuery();

    expect(query.index).toBe("byProjectId");
  });
});
