/* eslint-disable @typescript-eslint/no-explicit-any */
import { execAsync, execSync, type HyperDB, type Row, type Trait } from "./db";
import { isSelectRangeCmd } from "./selector";
import { type ExtractSchema, type TableDefinition } from "./table";

const withTraitsType = "withTraits";
const withoutTraitsType = "withoutTraits";
const insertType = "insert";
const updateType = "update";
const deleteType = "delete";
const getCurrentTraitsType = "getCurrentTraits";

export type WithTraitsCmd = {
  type: typeof withTraitsType;
  traits: Trait[];
};

export type WithoutTraitsCmd = {
  type: typeof withoutTraitsType;
  traits: Trait[];
};

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

export type GetCurrentTraitsCmd = {
  type: typeof getCurrentTraitsType;
};

export const isGetCurrentTraitsCmd = (cmd: any): cmd is GetCurrentTraitsCmd =>
  cmd.type === getCurrentTraitsType;

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

export function* withTraits(...traits: Trait[]): Generator<unknown> {
  yield {
    type: withTraitsType,
    traits,
  } satisfies WithTraitsCmd;
}

export function* withoutTraits(...traits: Trait[]): Generator<unknown> {
  yield {
    type: withoutTraitsType,
    traits,
  } satisfies WithoutTraitsCmd;
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

export function* getCurrentTraits(): Generator<unknown, Trait[], unknown> {
  return (yield {
    type: getCurrentTraitsType,
  } satisfies GetCurrentTraitsCmd) as Trait[];
}

export function syncDispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): TReturn {
  let result = action.next();

  const tx = execSync(db.beginTx());

  let isCommitted = false;
  try {
    while (!result.done) {
      if (isSelectRangeCmd(result.value)) {
        const { table, index, selectQuery } = result.value;

        result = action.next(
          execSync(
            tx.intervalScan(table, index, selectQuery.where, {
              limit: selectQuery.limit,
            }),
          ),
        );
      } else if (isInsertActionCmd(result.value)) {
        result = action.next(
          execSync(tx.insert(result.value.table, result.value.values)),
        );
      } else if (isUpdateActionCmd(result.value)) {
        result = action.next(
          execSync(tx.update(result.value.table, result.value.values)),
        );
      } else if (isDeleteActionCmd(result.value)) {
        result = action.next(
          execSync(tx.delete(result.value.table, result.value.values)),
        );
      } else if (isGetCurrentTraitsCmd(result.value)) {
        result = action.next(db.getTraits());
      } else {
        result = action.next();
      }
    }

    execSync(tx.commit());
    isCommitted = true;
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    if (!isCommitted) {
      execSync(tx.rollback());
    }
  }

  return result.value as TReturn;
}

export async function asyncDispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): Promise<TReturn> {
  let result = action.next();

  const tx = await execAsync(db.beginTx());

  let isCommitted = false;
  try {
    while (!result.done) {
      if (isSelectRangeCmd(result.value)) {
        const { table, index, selectQuery } = result.value;

        result = action.next(
          await execAsync(
            tx.intervalScan(table, index, selectQuery.where, {
              limit: selectQuery.limit,
            }),
          ),
        );
      } else if (isInsertActionCmd(result.value)) {
        result = action.next(
          await execAsync(tx.insert(result.value.table, result.value.values)),
        );
      } else if (isUpdateActionCmd(result.value)) {
        result = action.next(
          await execAsync(tx.update(result.value.table, result.value.values)),
        );
      } else if (isDeleteActionCmd(result.value)) {
        result = action.next(
          await execAsync(tx.delete(result.value.table, result.value.values)),
        );
      } else if (isGetCurrentTraitsCmd(result.value)) {
        result = action.next(db.getTraits());
      } else {
        result = action.next();
      }
    }

    await execAsync(tx.commit());
    isCommitted = true;
  } finally {
    if (!isCommitted) {
      await execAsync(tx.rollback());
    }
  }

  return result.value as TReturn;
}
