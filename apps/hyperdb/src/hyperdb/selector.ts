/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ExtractSchema,
  type ScanOptions,
  type TableDefinition,
} from "./db";
import { SubscribableDB, type Op } from "./subscribable-db";
import { isRowInRange } from "./drivers/InmemDriver";

type SelectRangeCmd = {
  type: "selectRange";
  table: TableDefinition<any>;
  index: string;
  options?: ScanOptions;
};

type SelectEqualCmd = {
  type: "selectEqual";
  table: TableDefinition<any>;
  indexName: string;
  values: string[];
};

const isSelectRangeCmd = (cmd: any): cmd is SelectRangeCmd =>
  cmd.type === "selectRange";
const isSelectCmd = (cmd: any): cmd is SelectEqualCmd =>
  cmd.type === "selectEqual";

export function* selectRange<TTable extends TableDefinition<any>>(
  table: TTable,
  indexName: keyof TTable["indexes"],
  options?: ScanOptions,
): Generator<unknown, ExtractSchema<TTable>[], unknown> {
  return (yield {
    type: "selectRange",
    table: table,
    index: indexName as string,
    options,
  } satisfies SelectRangeCmd) as ExtractSchema<TTable>[];
}

export function* selectEqual<TTable extends TableDefinition<any>>(
  table: TTable,
  indexName: keyof TTable["indexes"],
  vals: string[],
) {
  return (yield {
    type: "selectEqual",
    table: table,
    indexName: indexName as string,
    values: vals,
  } satisfies SelectEqualCmd) as ExtractSchema<TTable>[];
}

type SelectorFn<TReturn, TParams extends any[]> = (
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
    for (const op of ops) {
      if (op.type === "insert") {
        if (isRowInRange(op.newValue, cmd.table, cmd.index, cmd.options)) {
          return true;
        }
      }

      if (op.type === "update") {
        if (isRowInRange(op.oldValue, cmd.table, cmd.index, cmd.options)) {
          return true;
        }

        if (isRowInRange(op.newValue, cmd.table, cmd.index, cmd.options)) {
          return true;
        }
      }

      if (op.type === "delete") {
        if (isRowInRange(op.oldValue, cmd.table, cmd.index, cmd.options)) {
          return true;
        }
      }
    }
  }

  return false;
};

const isNeedToRerunEqual = (cmds: SelectEqualCmd[], ops: Op[]): boolean => {
  for (const cmd of cmds) {
    const indexDef = cmd.table.indexes[cmd.indexName];
    if (!indexDef)
      throw new Error(
        "Index not found: " + cmd.indexName + " for table: " + cmd.table.name,
      );
    if (indexDef.type !== "equal") {
      throw new Error(
        "Equal index required, got: " +
          indexDef.type +
          " for table: " +
          cmd.table.name,
      );
    }

    // TODO: maybe new Set() instead of includes?
    for (const op of ops) {
      if (op.type === "insert") {
        if (cmd.values.includes(op.newValue[indexDef.col as string] as string))
          return true;
      } else if (op.type === "update") {
        if (
          cmd.values.includes(op.newValue[indexDef.col as string] as string) ||
          cmd.values.includes(op.oldValue[indexDef.col as string] as string)
        )
          return true;
      } else if (op.type === "delete") {
        if (cmd.values.includes(op.oldValue[indexDef.col as string] as string))
          return true;
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
  const selectEqualCmds: SelectEqualCmd[] = [];

  const runSelector = () => {
    const currentGen = gen();
    let result = currentGen.next();

    selectRangeCmds.splice(0, selectRangeCmds.length);

    while (!result.done) {
      if (isSelectRangeCmd(result.value)) {
        selectRangeCmds.push(result.value);

        const { table, index, options } = result.value;

        result = currentGen.next(
          Array.from(db.intervalScan(table, index, options)),
        );
      } else if (isSelectCmd(result.value)) {
        selectEqualCmds.push(result.value);

        const { table, indexName, values } = result.value;

        result = currentGen.next(
          Array.from(db.hashScan(table, indexName, values)),
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
        if (
          !isNeedToRerunRange(selectRangeCmds, ops) &&
          !isNeedToRerunEqual(selectEqualCmds, ops)
        ) {
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
