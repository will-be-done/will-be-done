import type {
  TableDefinition,
  ExtractSchema,
  ExtractIndexes,
  UnionKeys,
  UnionValue,
} from "./table";
import type { Value } from "./db";
import { convertWhereToBound } from "./bounds";
import type { SelectRangeCmd } from "./selector-commands";

type QueryWhereClause = {
  lt: { col: string; val: Value }[];
  lte: { col: string; val: Value }[];
  gt: { col: string; val: Value }[];
  gte: { col: string; val: Value }[];
  eq: { col: string; val: Value }[];
};

export type QueryOrder = "asc" | "desc";

export type ExtractIndexName<TTable> = Extract<
  keyof ExtractIndexes<TTable>,
  string | number
>;

// Extract column names from an index
export type ExtractIndexColumns<
  TTable,
  TIndexName extends ExtractIndexName<TTable>,
> = ExtractIndexes<TTable>[TIndexName]["cols"] extends readonly (infer TCol)[]
  ? TCol extends UnionKeys<ExtractSchema<TTable>>
    ? TCol
    : never
  : never;

// Value type for a given column
export type ExtractColumnValue<
  TTable,
  TCol extends UnionKeys<ExtractSchema<TTable>>,
> = UnionValue<ExtractSchema<TTable>, TCol>;

type ExtractQueryColumnValue<
  TTable,
  TCol extends UnionKeys<ExtractSchema<TTable>>,
> = Extract<Exclude<ExtractColumnValue<TTable, TCol>, undefined>, Value>;

export type SelectQuery<
  TTable extends TableDefinition = TableDefinition,
  K extends ExtractIndexName<TTable> = ExtractIndexName<TTable>,
> = {
  limit?: number;
  order?: QueryOrder;
  from: TTable;
  index: K;
  where: QueryWhereClause[];
};

const createSelectRangeCmd = <QType extends SelectQuery>(
  query: QType,
): SelectRangeCmd => {
  const table = query.from;
  const indexName = query.index;
  const indexDef = table.indexes[indexName];
  if (!indexDef) {
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );
  }

  return {
    type: "selectRange",
    table,
    index: indexName as string,
    selectQuery: query,
    bounds: convertWhereToBound(indexDef.cols as string[], query.where),
  };
};

class QueryBuilder<TTable, TIndexName extends ExtractIndexName<TTable>> {
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

  private assertValue(val: Value): void {
    if (val === undefined) {
      throw new Error("Query filters do not support undefined values");
    }
  }

  eq<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractQueryColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    this.assertValue(val);
    const builder = this.clone();
    builder.conditions.eq.push({ col: col as string, val });
    return builder;
  }

  lt<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractQueryColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    this.assertValue(val);
    const builder = this.clone();
    builder.conditions.lt.push({ col: col as string, val });
    return builder;
  }

  lte<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractQueryColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    this.assertValue(val);
    const builder = this.clone();
    builder.conditions.lte.push({ col: col as string, val });
    return builder;
  }

  gt<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractQueryColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    this.assertValue(val);
    const builder = this.clone();
    builder.conditions.gt.push({ col: col as string, val });
    return builder;
  }

  gte<TCol extends ExtractIndexColumns<TTable, TIndexName>>(
    col: TCol,
    val: ExtractQueryColumnValue<TTable, TCol>,
  ): QueryBuilder<TTable, TIndexName> {
    this.assertValue(val);
    const builder = this.clone();
    builder.conditions.gte.push({ col: col as string, val });
    return builder;
  }

  getConditions(): QueryWhereClause {
    return { ...this.conditions };
  }
}

class SelectQueryBuilder<
  TTable extends TableDefinition,
  TIndexName extends ExtractIndexName<TTable>,
> {
  private table: TTable;
  private index: TIndexName;
  private limitValue?: number;
  private orderValue?: QueryOrder;

  constructor(
    table: TTable,
    index: TIndexName,
    limitValue?: number,
    orderValue?: QueryOrder,
  ) {
    this.table = table;
    this.index = index;
    this.limitValue = limitValue;
    this.orderValue = orderValue;
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
        this.orderValue,
      );
    } else {
      return new SelectQueryBuilderWithWhere(
        this.table,
        this.index,
        [result.getConditions()],
        this.limitValue,
        this.orderValue,
      );
    }
  }

  limit(limit: number): SelectQueryBuilder<TTable, TIndexName> {
    return new SelectQueryBuilder(
      this.table,
      this.index,
      limit,
      this.orderValue,
    );
  }

  order(order: QueryOrder): SelectQueryBuilder<TTable, TIndexName> {
    return new SelectQueryBuilder(
      this.table,
      this.index,
      this.limitValue,
      order,
    );
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
      ...(this.orderValue !== undefined ? { order: this.orderValue } : {}),
    };
  }

  *[Symbol.iterator](): Generator<unknown, ExtractSchema<TTable>[], unknown> {
    return (yield createSelectRangeCmd(
      this.toQuery(),
    )) as ExtractSchema<TTable>[];
  }
}

class SelectQueryBuilderWithWhere<
  TTable extends TableDefinition,
  TIndexName extends ExtractIndexName<TTable>,
> {
  private table: TTable;
  private index: TIndexName;
  private whereConditions: QueryWhereClause[];
  private limitValue?: number;
  private orderValue?: QueryOrder;

  constructor(
    table: TTable,
    index: TIndexName,
    whereConditions: QueryWhereClause[],
    limitValue?: number,
    orderValue?: QueryOrder,
  ) {
    this.table = table;
    this.index = index;
    this.whereConditions = whereConditions;
    this.limitValue = limitValue;
    this.orderValue = orderValue;
  }

  limit(limit: number): SelectQueryBuilderWithWhere<TTable, TIndexName> {
    return new SelectQueryBuilderWithWhere(
      this.table,
      this.index,
      this.whereConditions,
      limit,
      this.orderValue,
    );
  }

  order(order: QueryOrder): SelectQueryBuilderWithWhere<TTable, TIndexName> {
    return new SelectQueryBuilderWithWhere(
      this.table,
      this.index,
      this.whereConditions,
      this.limitValue,
      order,
    );
  }

  toQuery(): SelectQuery<TTable, TIndexName> {
    return {
      from: this.table,
      index: this.index,
      where: this.whereConditions,
      limit: this.limitValue,
      ...(this.orderValue !== undefined ? { order: this.orderValue } : {}),
    };
  }

  *[Symbol.iterator](): Generator<unknown, ExtractSchema<TTable>[], unknown> {
    return (yield createSelectRangeCmd(
      this.toQuery(),
    )) as ExtractSchema<TTable>[];
  }
}

export const selectFrom = <
  TTable extends TableDefinition,
  TIndexName extends ExtractIndexName<TTable>,
>(
  table: TTable,
  index: TIndexName,
): SelectQueryBuilder<TTable, TIndexName> => {
  return new SelectQueryBuilder(table, index);
};

export const or = <TTable, TIndexName extends ExtractIndexName<TTable>>(
  ...builders: QueryBuilder<TTable, TIndexName>[]
): QueryBuilder<TTable, TIndexName>[] => {
  return builders;
};
