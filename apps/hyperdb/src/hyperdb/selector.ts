/* eslint-disable @typescript-eslint/no-explicit-any */
import { uniq } from "es-toolkit";
import {
  type ExtractSchema,
  type Row,
  type ScanOptions,
  type TableDefinition,
} from "./db";
import { SubscribableDB } from "./subscribable-db";

type SelectCmd = {
  type: "select";
  db: SubscribableDB;
  table: TableDefinition<any>;
  index: string;
  options?: ScanOptions;
};

const isSelectCmd = (cmd: any): cmd is SelectCmd => cmd.type === "select";

export function* selectAll<TTable extends TableDefinition<any>>(
  db: SubscribableDB,
  table: TTable,
  indexName: keyof TTable["indexes"],
  options?: ScanOptions,
): Generator<unknown, ExtractSchema<TTable>[], unknown> {
  return (yield {
    type: "select",
    db: db,
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

// TODO: issues:
// 1. May miss new ops while running first while getting db(but not for sync dbs)
// 2. May miss new db to subscribe
export function subscribe<TReturn>(
  gen: () => Generator<unknown, TReturn, unknown>,
  cb: (value: TReturn) => void,
): () => void {
  const selectCmds: SelectCmd[] = [];

  const runSelector = (): SelectCmd[] => {
    const currentGen = gen();
    let result = currentGen.next();

    selectCmds.splice(0, selectCmds.length);

    while (!result.done) {
      if (isSelectCmd(result.value)) {
        selectCmds.push(result.value);

        const { table, index, options, db } = result.value;

        result = currentGen.next(
          Array.from(db.intervalScan(table, index, options)),
        );
      } else {
        result = currentGen.next();
      }
    }

    cb(result.value);

    return selectCmds;
  };

  runSelector();

  const dbUnsubscribes: (() => void)[] = [];

  const dbs = uniq(selectCmds.map((cmd) => cmd.db));
  for (const db of dbs) {
    dbUnsubscribes.push(db.subscribe((op) => {}));
  }

  return () => {
    for (const unsubscribe of dbUnsubscribes) {
      unsubscribe();
    }
  };
}
