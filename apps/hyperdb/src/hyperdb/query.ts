import type { TableDefinition, ExtractSchema, ExtractIndexes } from "./table";
import type { Value } from "./db";

export type WhereClause = {
  lt: { col: string; val: Value }[];
  lte: { col: string; val: Value }[];
  gt: { col: string; val: Value }[];
  gte: { col: string; val: Value }[];
  eq: { col: string; val: Value }[];
};

// Extract column names from an index
export type ExtractIndexColumns<
  TTable,
  TIndexName extends keyof ExtractIndexes<TTable>,
> = ExtractIndexes<TTable>[TIndexName]["cols"] extends readonly (infer TCol)[]
  ? TCol extends keyof ExtractSchema<TTable>
    ? TCol
    : never
  : never;

// Value type for a given column
export type ExtractColumnValue<
  TTable,
  TCol extends keyof ExtractSchema<TTable>,
> = ExtractSchema<TTable>[TCol];

type SelectQuery = {
  from: TableDefinition;
  index: string;
  where: WhereClause[];
};

class QueryBuilder<TTable, TIndexName extends keyof ExtractIndexes<TTable>> {
  private conditions: WhereClause = {
    lt: [],
    lte: [],
    gt: [],
    gte: [],
    eq: [],
  };

  private clone(): QueryBuilder<TTable, TIndexName> {
    const builder = new QueryBuilder<TTable, TIndexName>();
    builder.conditions = {
      lt: [...this.conditions.lt],
      lte: [...this.conditions.lte],
      gt: [...this.conditions.gt],
      gte: [...this.conditions.gte],
      eq: [...this.conditions.eq],
    };
    return builder;
  }

  eq<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    const builder = this.clone();
    builder.conditions.eq.push({ col: col as string, val: val as string });
    return builder;
  }

  lt<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    const builder = this.clone();
    builder.conditions.lt.push({ col: col as string, val: val as string });
    return builder;
  }

  lte<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    const builder = this.clone();
    builder.conditions.lte.push({ col: col as string, val: val as string });
    return builder;
  }

  gt<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    const builder = this.clone();
    builder.conditions.gt.push({ col: col as string, val: val as string });
    return builder;
  }

  gte<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    const builder = this.clone();
    builder.conditions.gte.push({ col: col as string, val: val as string });
    return builder;
  }

  getConditions(): WhereClause {
    return { ...this.conditions };
  }
}

class SelectQueryBuilder<
  TTable,
  TIndexName extends keyof ExtractIndexes<TTable>,
> {
  private table: TTable;
  private index: TIndexName;

  constructor(table: TTable, index: TIndexName) {
    this.table = table;
    this.index = index;
  }

  where(
    callback: (
      q: QueryBuilder<TTable, TIndexName>,
    ) => QueryBuilder<TTable, TIndexName> | QueryBuilder<TTable, TIndexName>[],
  ): SelectQuery {
    const queryBuilder = new QueryBuilder<TTable, TIndexName>();
    const result = callback(queryBuilder);

    if (Array.isArray(result)) {
      return {
        from: this.table as TableDefinition,
        index: this.index as string,
        where: result.map((builder) => builder.getConditions()),
      };
    } else {
      return {
        from: this.table as TableDefinition,
        index: this.index as string,
        where: [result.getConditions()],
      };
    }
  }
}

export const selectFrom = <
  TTable extends TableDefinition,
  TIndexName extends keyof ExtractIndexes<TTable>,
>(
  table: TTable,
  index: TIndexName,
): SelectQueryBuilder<TTable, TIndexName> => {
  return new SelectQueryBuilder(table, index);
};

export const or = <TTable, TIndexName extends keyof ExtractIndexes<TTable>>(
  ...builders: QueryBuilder<TTable, TIndexName>[]
): QueryBuilder<TTable, TIndexName>[] => {
  return builders;
};
