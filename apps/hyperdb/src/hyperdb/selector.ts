/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ExtractSchema,
  type ScanOptions,
  type TableDefinition,
} from "./db";
import { SubscribableDB, type Op } from "./subscribable-db";
import { isRowInRange } from "./drivers/InmemDriver";

type SelectCmd = {
  type: "select";
  table: TableDefinition<any>;
  index: string;
  options?: ScanOptions;
};

const isSelectCmd = (cmd: any): cmd is SelectCmd => cmd.type === "select";

export function* selectAll<TTable extends TableDefinition<any>>(
  table: TTable,
  indexName: keyof TTable["indexes"],
  options?: ScanOptions,
): Generator<unknown, ExtractSchema<TTable>[], unknown> {
  return (yield {
    type: "select",
    table: table,
    index: indexName as string,
    options,
  } satisfies SelectCmd) as ExtractSchema<TTable>[];
}

type SelectorFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => Generator<unknown, TReturn, unknown>;

export function selector<TReturn, TParams extends any[]>(
  fn: SelectorFn<TReturn, TParams>,
): SelectorFn<TReturn, TParams> {
  return fn;
}

const isNeedToRerun = (cmds: SelectCmd[], ops: Op[]): boolean => {
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
  const selectCmds: SelectCmd[] = [];

  const runSelector = () => {
    const currentGen = gen();
    let result = currentGen.next();

    selectCmds.splice(0, selectCmds.length);

    while (!result.done) {
      if (isSelectCmd(result.value)) {
        selectCmds.push(result.value);

        const { table, index, options } = result.value;

        result = currentGen.next(
          Array.from(db.intervalScan(table, index, options)),
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
        if (!isNeedToRerun(selectCmds, ops)) {
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
