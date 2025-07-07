import { describe, expect, it } from "vitest";
import { table } from "./table";
import { selectFrom, or } from "./query";

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
  it("works", () => {
    const result = selectFrom(tasksTable, "projectIdState").where((q) =>
      or(q.eq("projectId", "1").lte("state", "done"), q.eq("projectId", "2")),
    );

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
});
