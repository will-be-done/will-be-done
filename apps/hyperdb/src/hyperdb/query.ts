import type { TableDefinition, ExtractSchema, ExtractIndexes } from "./table";
import type { Value } from "./db";

type QueryWhereClause = {
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

export type SelectQuery<
  TTable extends TableDefinition = TableDefinition,
  K extends keyof ExtractIndexes<TTable> = keyof ExtractIndexes<TTable>,
> = {
  limit?: number;
  from: TTable;
  index: K;
  where: QueryWhereClause[];
};

class QueryBuilder<TTable, TIndexName extends keyof ExtractIndexes<TTable>> {
  private conditions: QueryWhereClause = {
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

  getConditions(): QueryWhereClause {
    return { ...this.conditions };
  }
}

class SelectQueryBuilder<
  TTable extends TableDefinition,
  TIndexName extends keyof ExtractIndexes<TTable>,
> {
  private table: TTable;
  private index: TIndexName;
  private limitValue?: number;

  constructor(table: TTable, index: TIndexName, limitValue?: number) {
    this.table = table;
    this.index = index;
    this.limitValue = limitValue;
  }

  where(
    callback: (
      q: QueryBuilder<TTable, TIndexName>,
    ) => QueryBuilder<TTable, TIndexName> | QueryBuilder<TTable, TIndexName>[],
  ): SelectQueryBuilderWithWhere<TTable, TIndexName> {
    const queryBuilder = new QueryBuilder<TTable, TIndexName>();
    const result = callback(queryBuilder);

    if (Array.isArray(result)) {
      return new SelectQueryBuilderWithWhere(
        this.table,
        this.index,
        result.map((builder) => builder.getConditions()),
        this.limitValue,
      );
    } else {
      return new SelectQueryBuilderWithWhere(
        this.table,
        this.index,
        [result.getConditions()],
        this.limitValue,
      );
    }
  }

  limit(limit: number): SelectQueryBuilder<TTable, TIndexName> {
    return new SelectQueryBuilder(this.table, this.index, limit);
  }

  toQuery(): SelectQuery<TTable, TIndexName> {
    return {
      from: this.table,
      index: this.index,
      where: [
        {
          lt: [],
          lte: [],
          gt: [],
          gte: [],
          eq: [],
        },
      ],
      limit: this.limitValue,
    };
  }
}

class SelectQueryBuilderWithWhere<
  TTable extends TableDefinition,
  TIndexName extends keyof ExtractIndexes<TTable>,
> {
  private table: TTable;
  private index: TIndexName;
  private whereConditions: QueryWhereClause[];
  private limitValue?: number;

  constructor(
    table: TTable,
    index: TIndexName,
    whereConditions: QueryWhereClause[],
    limitValue?: number,
  ) {
    this.table = table;
    this.index = index;
    this.whereConditions = whereConditions;
    this.limitValue = limitValue;
  }

  limit(limit: number): SelectQueryBuilderWithWhere<TTable, TIndexName> {
    return new SelectQueryBuilderWithWhere(
      this.table,
      this.index,
      this.whereConditions,
      limit,
    );
  }

  toQuery(): SelectQuery<TTable, TIndexName> {
    return {
      from: this.table,
      index: this.index,
      where: this.whereConditions,
      limit: this.limitValue,
    };
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
