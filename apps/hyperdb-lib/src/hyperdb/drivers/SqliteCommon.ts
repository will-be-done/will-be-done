/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MAX,
  MIN,
  type Row,
  type WhereClause,
  type SelectOptions,
} from "../db.ts";
import type { TableDefinition } from "../table.ts";
import { convertWhereToBound } from "../bounds.ts";
import {
  encodeSqliteSortKeyTuple,
  getSqliteSortKeyTuple,
  type SqliteSortKeyMode,
} from "./SqliteSortKey.ts";

export type SqlValue = number | string | Uint8Array | null;
export type BindParams = SqlValue[] | null;

export const CHUNK_SIZE = 12000;

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function isSchemalessTable(tableDef: TableDefinition): boolean {
  return !tableDef.schemaValidator;
}

export function assertSafeIdentifier(kind: string, value: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${kind} must be a safe SQL/JSON identifier: ${value}`);
  }
}

export function assertSafeTableDefinition(tableDef: TableDefinition): void {
  assertSafeIdentifier("Table name", tableDef.tableName);

  for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
    assertSafeIdentifier("Index name", indexName);

    for (const col of indexDef.cols) {
      assertSafeIdentifier("Index column", String(col));
    }
  }
}

export function sqliteIndexSortKeyColumn(indexName: string): string {
  assertSafeIdentifier("Index name", indexName);
  const columnName = `idx_${indexName}_sort_key`;
  assertSafeIdentifier("Sort-key column name", columnName);
  return columnName;
}

export function sqliteIndexSortColumns(
  indexColumns: readonly (string | number | symbol)[],
): string[] {
  const cols = indexColumns.map(String);
  if (cols[cols.length - 1] !== "id") {
    cols.push("id");
  }
  return cols;
}

export function sqliteIndexSortKeyMode(
  tableDef: TableDefinition,
  indexName: string,
): SqliteSortKeyMode {
  const indexDef = tableDef.indexes[indexName];
  return indexDef?.type === "btree" && isSchemalessTable(tableDef)
    ? "stored"
    : "scan";
}

export function getSqliteIndexSortKeyValue(
  tableDef: TableDefinition,
  indexName: string,
  row: Row,
): string | null {
  const indexDef = tableDef.indexes[indexName];
  if (!indexDef) throw new Error(`Index ${indexName} not found`);

  const sortColumns = sqliteIndexSortColumns(indexDef.cols);
  const includeMissing = indexDef.type === "btree" && isSchemalessTable(tableDef);
  const mode = sqliteIndexSortKeyMode(tableDef, indexName);
  const tuple = getSqliteSortKeyTuple(row, sortColumns, includeMissing);

  return tuple ? encodeSqliteSortKeyTuple(tuple, mode) : null;
}

export function buildRowInsertParams(
  tableDef: TableDefinition,
  row: Row,
): SqlValue[] {
  return [
    row.id,
    JSON.stringify(row),
    ...Object.keys(tableDef.indexes).map((indexName) =>
      getSqliteIndexSortKeyValue(tableDef, indexName, row),
    ),
  ];
}

function expandBoundTuple(
  tuple: readonly unknown[] | undefined,
  targetLength: number,
  filler: typeof MIN | typeof MAX,
): unknown[] | undefined {
  if (!tuple) return undefined;
  return [...tuple, ...new Array(targetLength - tuple.length).fill(filler)];
}

function validateHashBounds(
  indexName: string,
  indexColumn: string,
  bounds: ReturnType<typeof convertWhereToBound>,
): void {
  for (const bound of bounds) {
    if (
      (bound.gt !== undefined && bound.gt.length > 0) ||
      (bound.lt !== undefined && bound.lt.length > 0)
    ) {
      throw new Error(
        `Hash index doesn't support range conditions for column '${indexColumn}'`,
      );
    }

    if (
      (bound.lte && bound.lte.length !== 1) ||
      (bound.gte && bound.gte.length !== 1) ||
      !bound.lte ||
      !bound.gte
    ) {
      throw new Error(
        `Hash index should have exactly one equality condition for column '${indexColumn}' and index name '${indexName}': ${JSON.stringify(bound)}`,
      );
    }

    if (bound.lte[0] !== bound.gte[0]) {
      throw new Error(
        `Hash index should have the same equality condition for column '${indexColumn}'`,
      );
    }
  }
}

export function buildSortKeyWhereClause(
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
  const filterColumns = indexDef.cols.map(String);
  const sortColumns = sqliteIndexSortColumns(indexDef.cols);
  const mode = sqliteIndexSortKeyMode(tableDef, indexName);
  const rawBounds = convertWhereToBound(filterColumns, clauses);

  if (indexDef.type === "hash") {
    validateHashBounds(indexName, filterColumns[0], rawBounds);
  }

  const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
  const params: any[] = [];
  const rangeConditions: string[] = [];
  let hasUnboundedRange = false;

  for (const rawBound of rawBounds) {
    const bound = {
      gte: expandBoundTuple(rawBound.gte, sortColumns.length, MIN),
      gt: expandBoundTuple(rawBound.gt, sortColumns.length, MAX),
      lte: expandBoundTuple(rawBound.lte, sortColumns.length, MAX),
      lt: expandBoundTuple(rawBound.lt, sortColumns.length, MIN),
    };
    const current: string[] = [];
    const currentParams: string[] = [];

    if (bound.gte) {
      current.push(`${sortKeyColumn} >= ?`);
      currentParams.push(encodeSqliteSortKeyTuple(bound.gte, mode));
    }
    if (bound.gt) {
      current.push(`${sortKeyColumn} > ?`);
      currentParams.push(encodeSqliteSortKeyTuple(bound.gt, mode));
    }
    if (bound.lte) {
      current.push(`${sortKeyColumn} <= ?`);
      currentParams.push(encodeSqliteSortKeyTuple(bound.lte, mode));
    }
    if (bound.lt) {
      current.push(`${sortKeyColumn} < ?`);
      currentParams.push(encodeSqliteSortKeyTuple(bound.lt, mode));
    }

    if (current.length === 0) {
      hasUnboundedRange = true;
      break;
    }

    rangeConditions.push(`(${current.join(" AND ")})`);
    params.push(...currentParams);
  }

  const conditions = [`${sortKeyColumn} IS NOT NULL`];
  if (!hasUnboundedRange && rangeConditions.length > 0) {
    conditions.push(`(${rangeConditions.join(" OR ")})`);
  } else if (hasUnboundedRange) {
    params.length = 0;
  }

  return {
    where: `WHERE ${conditions.join(" AND ")}`,
    params,
  };
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

  return `ORDER BY ${sqliteIndexSortKeyColumn(indexName)} ${
    reverse ? "DESC" : "ASC"
  }`;
}

export function buildInsertSQL(
  tableDef: TableDefinition,
  valueCount: number,
  options: { replace?: boolean } = {},
): string {
  const indexColumns = Object.keys(tableDef.indexes).map((indexName) =>
    sqliteIndexSortKeyColumn(indexName),
  );
  const columns = ["id", "data", ...indexColumns];
  const rowPlaceholders = `(${columns.map(() => "?").join(", ")})`;
  const valuesQ = Array(valueCount).fill(rowPlaceholders).join(", ");
  const conflictMode = options.replace ? "INSERT OR REPLACE" : "INSERT";
  const sql =
    `${conflictMode} INTO ${tableDef.tableName} (${columns.join(
      ", ",
    )}) VALUES ${valuesQ}`
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
    SELECT data
    FROM ${tableName}
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function createTableSQL(tableDef: TableDefinition): string {
  const sortKeyColumns = Object.keys(tableDef.indexes).map(
    (indexName) => `${sqliteIndexSortKeyColumn(indexName)} TEXT`,
  );
  const sql = `
    CREATE TABLE IF NOT EXISTS ${tableDef.tableName} (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
      ${sortKeyColumns.length > 0 ? `, ${sortKeyColumns.join(", ")}` : ""}
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
): string {
  const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
  const indexIdentifier = `idx_${tableName}_${indexName}_sort_key`;
  assertSafeIdentifier("SQLite index name", indexIdentifier);
  const sql = `
    CREATE INDEX IF NOT EXISTS ${indexIdentifier}
    ON ${tableName}(${sortKeyColumn}, id)
    WHERE ${sortKeyColumn} IS NOT NULL
  `
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}

export function addSortKeyColumnSQL(
  tableName: string,
  sortKeyColumn: string,
): string {
  assertSafeIdentifier("Sort-key column name", sortKeyColumn);
  const sql = `ALTER TABLE ${tableName} ADD COLUMN ${sortKeyColumn} TEXT`
    .trim()
    .replace(/\n+/g, " ");

  console.log("%c" + sql, "color: #bada55");

  return sql;
}
