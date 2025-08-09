/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HyperDB, Row } from "./db";
import { isSelectRangeCmd } from "./selector";
import { type ExtractSchema, type TableDefinition } from "./table";

const insertType = "insert";
const updateType = "update";
const deleteType = "delete";

export type InsertActionCmd = {
  type: typeof insertType;
  table: TableDefinition;
  values: Row[];
};
const isInsertActionCmd = (cmd: any): cmd is InsertActionCmd =>
  cmd.type === insertType;

export type UpdateActionCmd = {
  type: typeof updateType;
  table: TableDefinition;
  values: Row[];
};
const isUpdateActionCmd = (cmd: any): cmd is UpdateActionCmd =>
  cmd.type === updateType;

export type DeleteActionCmd = {
  type: typeof deleteType;
  table: TableDefinition;
  values: string[];
};
const isDeleteActionCmd = (cmd: any): cmd is DeleteActionCmd =>
  cmd.type === deleteType;

export type ActionFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => Generator<unknown, TReturn, unknown>;

export function action<TReturn, TParams extends any[]>(
  fn: ActionFn<TReturn, TParams>,
): ActionFn<TReturn, TParams> {
  return fn;
}

export function* insert<TTable extends TableDefinition<any, any>>(
  table: TTable,
  values: ExtractSchema<TTable>[],
): Generator<unknown> {
  yield {
    type: insertType,
    table,
    values,
  } satisfies InsertActionCmd;
}

export function* update<TTable extends TableDefinition<any, any>>(
  table: TTable,
  values: ExtractSchema<TTable>[],
): Generator<unknown> {
  yield {
    type: updateType,
    table,
    values,
  } satisfies UpdateActionCmd;
}

export function* deleteRows<TTable extends TableDefinition<any, any>>(
  table: TTable,
  values: string[],
): Generator<unknown> {
  yield {
    type: deleteType,
    table,
    values,
  } satisfies DeleteActionCmd;
}

export function dispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): TReturn {
  let result = action.next();

  const tx = db.beginTx();

  console.log("action", action, db);
  while (!result.done) {
    if (isSelectRangeCmd(result.value)) {
      const { table, index, selectQuery } = result.value;

      result = action.next(
        Array.from(
          tx.intervalScan(table, index, selectQuery.where, {
            limit: selectQuery.limit,
          }),
        ),
      );
    } else if (isInsertActionCmd(result.value)) {
      result = action.next(tx.insert(result.value.table, result.value.values));
    } else if (isUpdateActionCmd(result.value)) {
      result = action.next(tx.update(result.value.table, result.value.values));
    } else if (isDeleteActionCmd(result.value)) {
      result = action.next(tx.delete(result.value.table, result.value.values));
    } else {
      result = action.next();
    }
  }

  tx.commit();

  return result.value as TReturn;
}
