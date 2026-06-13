import { runCommandGenerator } from "../runner";
import { execAsync, execSync } from "../../core/executor";
import type { HyperDB } from "../../core/contracts";
import type { Trait } from "../../core/primitives";
import type { ExtractSchema, TableDefinition } from "../../schema/table";
import { wrapGeneratorWithTraceMeta } from "../../tracing/metadata";
import {
  deleteType,
  getCurrentTraitsType,
  insertType,
  upsertType,
  type DeleteActionCmd,
  type GetCurrentTraitsCmd,
  type InsertActionCmd,
  type UpsertActionCmd,
} from "./commands";

export * from "./commands";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type ActionFn<TReturn, TParams extends any[]> = (
  ...args: TParams
) => Generator<unknown, TReturn, unknown>;

export function action<TReturn, TParams extends any[]>(
  fn: ActionFn<TReturn, TParams>,
): ActionFn<TReturn, TParams> {
  return ((...args: TParams) =>
    wrapGeneratorWithTraceMeta(
      fn(...args),
      "action",
      fn.name || "anonymous action",
      args,
    )) as ActionFn<TReturn, TParams>;
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

export function* upsert<TTable extends TableDefinition<any, any>>(
  table: TTable,
  values: ExtractSchema<TTable>[],
): Generator<unknown> {
  yield {
    type: upsertType,
    table,
    values,
  } satisfies UpsertActionCmd;
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
  const tx = execSync(db.beginTx());

  let isCommitted = false;
  try {
    const result = execSync(
      runCommandGenerator(tx, action, { allowWrites: true }),
    );

    execSync(tx.commit());
    isCommitted = true;

    return result;
  } finally {
    if (!isCommitted) {
      execSync(tx.rollback());
    }
  }
}

export async function asyncDispatch<TReturn>(
  db: HyperDB,
  action: Generator<unknown, TReturn, unknown>,
): Promise<TReturn> {
  const tx = await execAsync(db.beginTx());

  let isCommitted = false;
  try {
    const result = await execAsync(
      runCommandGenerator(tx, action, { allowWrites: true }),
    );

    await execAsync(tx.commit());
    isCommitted = true;

    return result;
  } finally {
    if (!isCommitted) {
      await execAsync(tx.rollback());
    }
  }
}
