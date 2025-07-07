import type { TableDefinition } from "./table";

type WhereClause = {
  lt: { col: string; val: string }[];
  lte: { col: string; val: string }[];
  gt: { col: string; val: string }[];
  gte: { col: string; val: string }[];
  eq: { col: string; val: string }[];
};


type SelectQuery = {
  from: TableDefinition;
  index: string;
  where: WhereClause[];
};

class QueryBuilder {
  private conditions: WhereClause = {
    lt: [],
    lte: [],
    gt: [],
    gte: [],
    eq: [],
  };

  private clone(): QueryBuilder {
    const builder = new QueryBuilder();
    builder.conditions = {
      lt: [...this.conditions.lt],
      lte: [...this.conditions.lte],
      gt: [...this.conditions.gt],
      gte: [...this.conditions.gte],
      eq: [...this.conditions.eq],
    };
    return builder;
  }

  eq(col: string, val: string): QueryBuilder {
    const builder = this.clone();
    builder.conditions.eq.push({ col, val });
    return builder;
  }

  lt(col: string, val: string): QueryBuilder {
    const builder = this.clone();
    builder.conditions.lt.push({ col, val });
    return builder;
  }

  lte(col: string, val: string): QueryBuilder {
    const builder = this.clone();
    builder.conditions.lte.push({ col, val });
    return builder;
  }

  gt(col: string, val: string): QueryBuilder {
    const builder = this.clone();
    builder.conditions.gt.push({ col, val });
    return builder;
  }

  gte(col: string, val: string): QueryBuilder {
    const builder = this.clone();
    builder.conditions.gte.push({ col, val });
    return builder;
  }

  getConditions(): WhereClause {
    return { ...this.conditions };
  }
}

class SelectQueryBuilder {
  private table: TableDefinition;
  private index: string;
  
  constructor(table: TableDefinition, index: string) {
    this.table = table;
    this.index = index;
  }

  where(callback: (q: QueryBuilder) => QueryBuilder | QueryBuilder[]): SelectQuery {
    const queryBuilder = new QueryBuilder();
    const result = callback(queryBuilder);
    
    if (Array.isArray(result)) {
      return {
        from: this.table,
        index: this.index,
        where: result.map(builder => builder.getConditions()),
      };
    } else {
      return {
        from: this.table,
        index: this.index,
        where: [result.getConditions()],
      };
    }
  }
}

export const selectFrom = (
  table: TableDefinition,
  index: string,
): SelectQueryBuilder => {
  return new SelectQueryBuilder(table, index);
};

export const or = (...builders: QueryBuilder[]): QueryBuilder[] => {
  return builders;
};
