/* eslint-disable @typescript-eslint/no-explicit-any */
import { SubscribableDB, type Op } from "./subscribable-db";
import type { ExtractSchema, TableDefinition } from "./table";
import type { Row, TupleScanOptions } from "./db";
import { isRowInRange } from "./drivers/tuple";
import type { SelectQuery } from "./query";
import { convertWhereToBound } from "./bounds";

export type PartialScanOptions<T extends Row = Row> = {
  lte?: Partial<T>[];
  gte?: Partial<T>[];
  lt?: Partial<T>[];
  gt?: Partial<T>[];
  // limit?: number;
};

const noopType = "noop";
const selectRangeType = "selectRange";
type SelectRangeCmd = {
  type: typeof selectRangeType;
  table: TableDefinition<any>;
  index: string;
  selectQuery: SelectQuery;
  bounds: TupleScanOptions[];
};
type NoopCmd = { type: typeof noopType };

// type SelectEqualCmd = {
//   type: "selectEqual";
//   table: TableDefinition<any>;
//   indexName: string;
//   values: string[];
// };

export const isSelectRangeCmd = (cmd: any): cmd is SelectRangeCmd =>
  cmd.type === selectRangeType;
export const isNoopCmd = (cmd: any): cmd is NoopCmd => cmd.type === noopType;
// const isSelectCmd = (cmd: any): cmd is SelectEqualCmd =>
//   cmd.type === "selectEqual";

export function* runQuery<QType extends SelectQuery>(toQuery: {
  toQuery(): QType;
}): Generator<unknown, ExtractSchema<QType["from"]>[], unknown> {
  const query = toQuery.toQuery();
  const table = query.from;
  const indexName = query.index;
  const indexDef = table.indexes[indexName];
  if (!indexDef)
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );

  return (yield {
    type: "selectRange",
    table: table,
    index: indexName as string,
    selectQuery: query,
    bounds: convertWhereToBound(indexDef.cols as string[], query.where),
  } satisfies SelectRangeCmd) as ExtractSchema<QType["from"]>[];
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

export type SelectorGeneratorFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => Generator<unknown, TReturn, unknown>;
export type SelectorFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => TReturn;

const GeneratorFunction = function* () {
  yield undefined;
}.constructor;

const isGenerator = (fn: unknown): fn is Generator<unknown, unknown, unknown> =>
  fn instanceof GeneratorFunction;

export function selector<TReturn, TParams extends any[]>(
  fn: SelectorGeneratorFn<TReturn, TParams> | SelectorFn<TReturn, TParams>,
): SelectorGeneratorFn<TReturn, TParams> {
  return (...args: TParams) => {
    const res = fn(...args);
    if (isGenerator(fn)) {
      return res as Generator<unknown, TReturn, unknown>;
    } else {
      return (function* () {
        yield { type: noopType };

        return res;
      })() as Generator<unknown, TReturn, unknown>;
    }
  };
}

// TODO: maybe range tree instead?
const isNeedToRerunRange = (cmds: SelectRangeCmd[], ops: Op[]): boolean => {
  for (const cmd of cmds) {
    for (const bound of cmd.bounds) {
      for (const op of ops) {
        if (op.table !== cmd.table) continue;

        if (op.type === "insert") {
          if (isRowInRange(op.newValue, cmd.table, cmd.index, bound)) {
            return true;
          }
        }

        if (op.type === "update") {
          if (isRowInRange(op.oldValue, cmd.table, cmd.index, bound)) {
            return true;
          }

          if (isRowInRange(op.newValue, cmd.table, cmd.index, bound)) {
            return true;
          }
        }

        if (op.type === "delete") {
          if (isRowInRange(op.oldValue, cmd.table, cmd.index, bound)) {
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

        const { table, index, selectQuery } = result.value;

        result = currentGen.next(
          Array.from(
            db.intervalScan(table, index, selectQuery.where, {
              limit: selectQuery.limit,
            }),
          ),
        );
      } else if (isNoopCmd(result.value)) {
        result = currentGen.next();
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

export function select<TReturn>(
  db: SubscribableDB,
  gen: () => Generator<unknown, TReturn, unknown>,
): TReturn {
  const selector = initSelector(db, gen);
  return selector.getSnapshot();
}
