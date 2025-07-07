/* eslint-disable @typescript-eslint/no-explicit-any */
import { SubscribableDB, type Op } from "./subscribable-db";
import type { ExtractIndexes, ExtractSchema, TableDefinition } from "./table";
import type { Row, SelectOptions, WhereClause } from "./db";
import { isRowInRange } from "./drivers/tuple";

export type PartialScanOptions<T extends Row = Row> = {
  lte?: Partial<T>[];
  gte?: Partial<T>[];
  lt?: Partial<T>[];
  gt?: Partial<T>[];
  // limit?: number;
};

const selectRangeType = "selectRange";
type SelectRangeCmd = {
  type: typeof selectRangeType;
  table: TableDefinition<any>;
  index: string;
  scanOptions: WhereClause[];
  selectOptions?: SelectOptions;
};

// type SelectEqualCmd = {
//   type: "selectEqual";
//   table: TableDefinition<any>;
//   indexName: string;
//   values: string[];
// };

export const isSelectRangeCmd = (cmd: any): cmd is SelectRangeCmd =>
  cmd.type === selectRangeType;
// const isSelectCmd = (cmd: any): cmd is SelectEqualCmd =>
//   cmd.type === "selectEqual";

export function* selectRange<
  TTable extends TableDefinition<any, any>,
  K extends keyof ExtractIndexes<TTable>,
>(
  table: TTable,
  indexName: K,
  scanOptions?: PartialScanOptions<ExtractSchema<TTable>>[],
  selectOptions?: SelectOptions,
): Generator<unknown, ExtractSchema<TTable>[], unknown> {
  if (scanOptions && scanOptions.length === 0) {
    throw new Error(
      "scan options must be provided. To make full scan prove [{}]",
    );
  }

  const indexDef = table.indexes[indexName];
  if (!indexDef)
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );


  const whereClausesOptions = (scanOptions || [{}]).map((opt) => {
    const clause: WhereClause = {};
    
    if (opt.lte) {
      clause.lte = opt.lte.map((partial) => {
        const [col, val] = Object.entries(partial)[0];
        return { col, val: val as any };
      });
    }
    if (opt.gte) {
      clause.gte = opt.gte.map((partial) => {
        const [col, val] = Object.entries(partial)[0];
        return { col, val: val as any };
      });
    }
    if (opt.lt) {
      clause.lt = opt.lt.map((partial) => {
        const [col, val] = Object.entries(partial)[0];
        return { col, val: val as any };
      });
    }
    if (opt.gt) {
      clause.gt = opt.gt.map((partial) => {
        const [col, val] = Object.entries(partial)[0];
        return { col, val: val as any };
      });
    }
    
    return clause;
  });

  return (yield {
    type: "selectRange",
    table: table,
    index: indexName as string,
    scanOptions: whereClausesOptions,
    selectOptions: selectOptions,
  } satisfies SelectRangeCmd) as ExtractSchema<TTable>[];
}

// export function* selectEqual<TTable extends TableDefinition<any>>(
//   table: TTable,
//   indexName: keyof TTable["indexes"],
//   vals: string[],
// ) {
//   return (yield {
//     type: "selectEqual",
//     table: table,
//     indexName: indexName as string,
//     values: vals,
//   } satisfies SelectEqualCmd) as ExtractSchema<TTable>[];
// }

export type SelectorFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => Generator<unknown, TReturn, unknown>;

export function selector<TReturn, TParams extends any[]>(
  fn: SelectorFn<TReturn, TParams>,
): SelectorFn<TReturn, TParams> {
  return fn;
}

// TODO: maybe range tree instead?
const isNeedToRerunRange = (cmds: SelectRangeCmd[], ops: Op[]): boolean => {
  for (const cmd of cmds) {
    for (const whereClause of cmd.scanOptions) {
      for (const op of ops) {
        if (op.type === "insert") {
          if (isRowInRange(op.newValue, cmd.table, cmd.index, whereClause)) {
            return true;
          }
        }

        if (op.type === "update") {
          if (isRowInRange(op.oldValue, cmd.table, cmd.index, whereClause)) {
            return true;
          }

          if (isRowInRange(op.newValue, cmd.table, cmd.index, whereClause)) {
            return true;
          }
        }

        if (op.type === "delete") {
          if (isRowInRange(op.oldValue, cmd.table, cmd.index, whereClause)) {
            return true;
          }
        }
      }
    }
  }

  return false;
};

// TODO: issues:
// 1. May miss new ops while running first while getting db(but not for sync dbs)
export function initSelector<TReturn>(
  db: SubscribableDB,
  gen: () => Generator<unknown, TReturn, unknown>,
): {
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => TReturn;
} {
  let currentResult: TReturn | undefined;
  const selectRangeCmds: SelectRangeCmd[] = [];

  const runSelector = () => {
    const currentGen = gen();
    let result = currentGen.next();

    selectRangeCmds.splice(0, selectRangeCmds.length);

    while (!result.done) {
      if (isSelectRangeCmd(result.value)) {
        selectRangeCmds.push(result.value);

        const { table, index, scanOptions, selectOptions } = result.value;

        result = currentGen.next(
          Array.from(db.intervalScan(table, index, scanOptions, selectOptions)),
        );
      } else {
        result = currentGen.next();
      }
    }

    currentResult = result.value;
    // for (const subscriber of subscribers) {
    //   subscriber();
    // }

    // let wasRerun = false;
    // const dbs = uniq(selectCmds.map((cmd) => cmd.db));
    // for (const db of dbs) {
    //   const unsubscribe = db.subscribe((ops) => {
    //     if (wasRerun) {
    //       return; // already rerun
    //     }
    //
    //     if (!isNeedToRerun(selectCmds, db, ops)) {
    //       return;
    //     }
    //
    //     try {
    //       runSelector();
    //     } finally {
    //       wasRerun = true;
    //     }
    //   });
    //
    //   dbUnsubscribes.push(unsubscribe);
    // }
  };

  runSelector();

  return {
    subscribe: (callback: () => void) => {
      const dbUnsubscribes: (() => void)[] = [];

      const unsubscribe = db.subscribe((ops) => {
        if (!isNeedToRerunRange(selectRangeCmds, ops)) {
          return;
        }

        runSelector();
        callback();
      });

      dbUnsubscribes.push(unsubscribe);

      return () => {
        for (const unsubscribe of dbUnsubscribes) {
          unsubscribe();
        }
      };
    },
    getSnapshot: () => currentResult!,
  };
}
