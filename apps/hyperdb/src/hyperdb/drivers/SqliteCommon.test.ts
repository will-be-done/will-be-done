import { describe, it, expect } from "vitest";
import { buildWhereClause } from "./SqliteCommon";
import type { TableDefinition } from "../table";
import type { WhereClause } from "../db";

const changesTable: TableDefinition = {
  tableName: "changes",
  schema: {} as {
    id: string;
    entityId: string;
    tableName: string;
    updatedAt: number;
  },
  indexes: {
    byId: { type: "hash", cols: ["id"] },
    byEntityIdAndTableName: {
      type: "btree",
      cols: ["entityId", "tableName"],
    },
    byUpdatedAt: { type: "btree", cols: ["updatedAt"] },
  },
  idIndexName: "byId",
};

const tableDefinitions = new Map<string, TableDefinition>([
  ["changes", changesTable],
]);

describe("buildWhereClause", () => {
  describe("eq optimization - single column", () => {
    it("uses IN clause for single-column eq", () => {
      const clauses: WhereClause[] = [
        { eq: [{ col: "entityId", val: "a" }] },
        { eq: [{ col: "entityId", val: "b" }] },
        { eq: [{ col: "entityId", val: "c" }] },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      expect(result.where).toBe(
        "WHERE json_extract(data, '$.entityId') IN (?, ?, ?)",
      );
      expect(result.params).toEqual(["a", "b", "c"]);
    });
  });

  describe("eq optimization - multi-column tuple IN", () => {
    it("uses tuple IN (VALUES ...) for multi-column eq with same columns", () => {
      const clauses: WhereClause[] = [
        {
          eq: [
            { col: "entityId", val: "a" },
            { col: "tableName", val: "tasks" },
          ],
        },
        {
          eq: [
            { col: "entityId", val: "b" },
            { col: "tableName", val: "projects" },
          ],
        },
        {
          eq: [
            { col: "entityId", val: "c" },
            { col: "tableName", val: "tasks" },
          ],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.entityId'), json_extract(data, '$.tableName')) IN (VALUES (?, ?), (?, ?), (?, ?))",
      );
      expect(result.params).toEqual([
        "a",
        "tasks",
        "b",
        "projects",
        "c",
        "tasks",
      ]);
    });
  });

  describe("gte+lte normalization to eq", () => {
    it("normalizes gte+lte with same values to tuple IN", () => {
      const clauses: WhereClause[] = [
        {
          gte: [
            { col: "entityId", val: "a" },
            { col: "tableName", val: "tasks" },
          ],
          lte: [
            { col: "entityId", val: "a" },
            { col: "tableName", val: "tasks" },
          ],
        },
        {
          gte: [
            { col: "entityId", val: "b" },
            { col: "tableName", val: "projects" },
          ],
          lte: [
            { col: "entityId", val: "b" },
            { col: "tableName", val: "projects" },
          ],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.entityId'), json_extract(data, '$.tableName')) IN (VALUES (?, ?), (?, ?))",
      );
      expect(result.params).toEqual(["a", "tasks", "b", "projects"]);
    });

    it("normalizes single-column gte+lte to IN clause", () => {
      const clauses: WhereClause[] = [
        {
          gte: [{ col: "entityId", val: "a" }],
          lte: [{ col: "entityId", val: "a" }],
        },
        {
          gte: [{ col: "entityId", val: "b" }],
          lte: [{ col: "entityId", val: "b" }],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      expect(result.where).toBe(
        "WHERE json_extract(data, '$.entityId') IN (?, ?)",
      );
      expect(result.params).toEqual(["a", "b"]);
    });

    it("does NOT normalize when gte and lte values differ", () => {
      const clauses: WhereClause[] = [
        {
          gte: [
            { col: "entityId", val: "a" },
            { col: "tableName", val: "tasks" },
          ],
          lte: [
            { col: "entityId", val: "z" },
            { col: "tableName", val: "tasks" },
          ],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      // Should fall through to the gte/lte operators
      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.entityId') >= ? AND json_extract(data, '$.tableName') >= ? AND json_extract(data, '$.entityId') <= ? AND json_extract(data, '$.tableName') <= ?)",
      );
      expect(result.params).toEqual(["a", "tasks", "z", "tasks"]);
    });

    it("does NOT normalize when clause has mixed operators (gte+lte+gt)", () => {
      const clauses: WhereClause[] = [
        {
          gte: [{ col: "entityId", val: "a" }],
          lte: [{ col: "entityId", val: "a" }],
          gt: [{ col: "tableName", val: "foo" }],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      // Should fall through since gt is present
      expect(result.where).toContain(">");
      expect(result.where).toContain(">=");
      expect(result.where).toContain("<=");
    });
  });

  describe("mixed clauses - fallback", () => {
    it("uses OR for multiple clauses with range operators", () => {
      const clauses: WhereClause[] = [
        {
          gte: [{ col: "updatedAt", val: 100 }],
          lte: [{ col: "updatedAt", val: 200 }],
        },
        {
          gte: [{ col: "updatedAt", val: 300 }],
          lte: [{ col: "updatedAt", val: 400 }],
        },
      ];

      const result = buildWhereClause(
        "byUpdatedAt",
        "changes",
        clauses,
        tableDefinitions,
      );

      // These have different gte/lte values so they won't be normalized
      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.updatedAt') >= ? AND json_extract(data, '$.updatedAt') <= ?) OR (json_extract(data, '$.updatedAt') >= ? AND json_extract(data, '$.updatedAt') <= ?)",
      );
      expect(result.params).toEqual([100, 200, 300, 400]);
    });

    it("handles gt operator", () => {
      const clauses: WhereClause[] = [
        { gt: [{ col: "updatedAt", val: 100 }] },
      ];

      const result = buildWhereClause(
        "byUpdatedAt",
        "changes",
        clauses,
        tableDefinitions,
      );

      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.updatedAt') > ?)",
      );
      expect(result.params).toEqual([100]);
    });
  });

  describe("mixed normalized and non-normalized clauses", () => {
    it("falls back when some clauses are eq and some are ranges", () => {
      const clauses: WhereClause[] = [
        { eq: [{ col: "entityId", val: "a" }] },
        {
          gte: [{ col: "entityId", val: "b" }],
          lte: [{ col: "entityId", val: "z" }],
        },
      ];

      const result = buildWhereClause(
        "byEntityIdAndTableName",
        "changes",
        clauses,
        tableDefinitions,
      );

      // Second clause is a real range, so can't all be normalized to eq
      expect(result.where).toBe(
        "WHERE (json_extract(data, '$.entityId') = ?) OR (json_extract(data, '$.entityId') >= ? AND json_extract(data, '$.entityId') <= ?)",
      );
      expect(result.params).toEqual(["a", "b", "z"]);
    });
  });
});
