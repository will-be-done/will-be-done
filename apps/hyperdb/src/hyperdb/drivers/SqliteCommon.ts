/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WhereClause, Value, SelectOptions } from "../db.ts";
import type { TableDefinition } from "../table.ts";

export type SqlValue = number | string | Uint8Array | null;
export type BindParams = SqlValue[] | null;

export const CHUNK_SIZE = 12000;

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function buildWhereClause(
  indexName: string,
  tableName: string,
  clauses: WhereClause[],
  tableDefinitions: Map<string, TableDefinition>,
): { where: string; params: any[] } {
  const tableDef = tableDefinitions.get(tableName);
  if (!tableDef) {
    throw new Error(`Table ${tableName} not found`);
  }

  const indexDef = tableDef.indexes[indexName];
  if (!indexDef) throw new Error(`Index ${indexName} not found`);

  // Normalize clauses: convert gte+lte with same values to eq (effective equality)
  const normalizedClauses = clauses.map((clause) => {
    if (!clause.gte || !clause.lte) return clause;
    if (clause.gt || clause.lt || clause.eq) return clause;

    const gteMap = new Map(
      clause.gte.map(({ col, val }) => [String(col), val]),
    );
    const lteMap = new Map(
      clause.lte.map(({ col, val }) => [String(col), val]),
    );

    // Check all gte columns have matching lte with same value
    if (gteMap.size !== lteMap.size) return clause;

    const eqPairs: { col: string; val: Value }[] = [];
    for (const [col, val] of gteMap) {
      if (lteMap.get(col) !== val) return clause;
      eqPairs.push({ col, val });
    }

    return { eq: eqPairs };
  });

  // Check if all clauses are equality-only (each clause only has eq, no other operators)
  const allEqualityOnly = normalizedClauses.every(
    (clause) => clause.eq && clause.eq.length > 0,
  );

  if (allEqualityOnly && normalizedClauses.length > 0) {
    // Check if all clauses have the same columns (for tuple IN optimization)
    const firstCols = normalizedClauses[0]
      .eq!.map(({ col }) => String(col))
      .sort()
      .join(",");
    const allSameCols = normalizedClauses.every(
      (clause) =>
        clause
          .eq!.map(({ col }) => String(col))
          .sort()
          .join(",") === firstCols,
    );

    if (allSameCols && normalizedClauses[0].eq!.length > 1) {
      // Use tuple IN (VALUES ...) for multi-column equality with same columns
      const cols = normalizedClauses[0].eq!.map(({ col }) => String(col));
      const columnPaths = cols.map(
        (col) => `json_extract(data, '$.${col}')`,
      );
      const params: any[] = [];
      const valueTuples: string[] = [];

      for (const clause of normalizedClauses) {
        const colToVal = new Map(
          clause.eq!.map(({ col, val }) => [String(col), val]),
        );
        const placeholders = cols.map(() => "?").join(", ");
        valueTuples.push(`(${placeholders})`);
        for (const col of cols) {
          params.push(colToVal.get(col));
        }
      }

      const whereClause = `WHERE (${columnPaths.join(", ")}) IN (VALUES ${valueTuples.join(", ")})`;
      return { where: whereClause, params };
    }

    // Single-column equality: use simple IN clause
    const columnValueMap = new Map<string, Value[]>();

    for (const clause of normalizedClauses) {
      if (clause.eq) {
        for (const { col, val } of clause.eq) {
          const colKey = String(col);
          if (!columnValueMap.has(colKey)) {
            columnValueMap.set(colKey, []);
          }
          columnValueMap.get(colKey)!.push(val);
        }
      }
    }

    const conditions: string[] = [];
    const params: any[] = [];

    for (const [col, values] of columnValueMap) {
      const columnPath = `json_extract(data, '$.${col}')`;
      const placeholders = values.map(() => "?").join(", ");
      conditions.push(`${columnPath} IN (${placeholders})`);
      params.push(...values);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return { where: whereClause, params };
  }

  // Fallback to original logic for mixed conditions
  const conditions: string[] = [];
  const params: any[] = [];

  for (const clause of clauses) {
    const currentCond: string[] = [];

    const buildColumnComparison = (
      operator: string,
      columnConditions: { col: string; val: Value }[],
    ) => {
      for (const { col, val } of columnConditions) {
        const columnPath = `json_extract(data, '$.${String(col)}')`;
        currentCond.push(`${columnPath} ${operator} ?`);
        params.push(val);
      }
    };

    if (clause.gt) {
      buildColumnComparison(">", clause.gt);
    }
    if (clause.gte) {
      buildColumnComparison(">=", clause.gte);
    }
    if (clause.lt) {
      buildColumnComparison("<", clause.lt);
    }
    if (clause.lte) {
      buildColumnComparison("<=", clause.lte);
    }
    if (clause.eq) {
      buildColumnComparison("=", clause.eq);
    }

    if (currentCond.length > 0) {
      conditions.push(`(${currentCond.join(" AND ")})`);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";
  return { where: whereClause, params };
}

export function buildOrderClause(
  indexName: string,
  tableName: string,
  tableDefinitions: Map<string, TableDefinition>,
  reverse: boolean = false,
): string {
  const tableDef = tableDefinitions.get(tableName);
  if (!tableDef) {
    return "";
  }

  const indexDef = tableDef.indexes[indexName];
  if (!indexDef) {
    return "";
  }

  const indexColumns = indexDef.cols;

  const orderColumns = indexColumns
    .map((col) => {
      const jsonPath = `json_extract(data, '$.${String(col)}')`;
      return `${jsonPath} ${reverse ? "DESC" : "ASC"}`;
    })
    .join(", ");

  return `ORDER BY ${orderColumns}`;
}

export function buildInsertSQL(tableName: string, valueCount: number): string {
  const valuesQ = Array(valueCount).fill("(?, ?)").join(", ");
  const sql = `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES ${valuesQ}`
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function buildDeleteSQL(tableName: string, idCount: number): string {
  const placeholders = Array(idCount).fill("?").join(", ");
  const sql = `DELETE FROM ${tableName} WHERE id IN (${placeholders})`
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function buildSelectSQL(
  tableName: string,
  whereClause: string,
  orderClause: string,
  selectOptions: SelectOptions,
): string {
  const limitClause =
    selectOptions.limit !== undefined ? `LIMIT ${selectOptions.limit}` : "";

  const sql = `
    SELECT data FROM ${tableName}
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function createTableSQL(tableName: string): string {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )
  `
    .trim()
    .replace(/\n+/g, " ");
  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function createIndexSQL(
  tableName: string,
  indexName: string,
  cols: readonly (string | number | symbol)[],
  isIdIndex: boolean,
): string {
  const columnPaths = cols
    .map((col) => `json_extract(data, '$.${String(col)}') ASC`)
    .join(", ");

  const uniqueKeyword = isIdIndex ? "UNIQUE" : "";

  const sql = `
    CREATE ${uniqueKeyword} INDEX IF NOT EXISTS idx_${tableName}_${indexName} 
    ON ${tableName}(${columnPaths})
  `
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}
