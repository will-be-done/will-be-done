/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row, Trait } from "./db";
import { type ExtractSchema, type TableDefinition } from "./table";

const insertType = "insert";
const upsertType = "upsert";
const deleteType = "delete";
const getCurrentTraitsType = "getCurrentTraits";

export type InsertActionCmd = {
  type: typeof insertType;
  table: TableDefinition;
  values: Row[];
};

export type UpsertActionCmd = {
  type: typeof upsertType;
  table: TableDefinition;
  values: Row[];
};

export type DeleteActionCmd = {
  type: typeof deleteType;
  table: TableDefinition;
  values: string[];
};

export type GetCurrentTraitsCmd = {
  type: typeof getCurrentTraitsType;
};

const isCmdObject = (cmd: unknown): cmd is { type?: unknown } =>
  cmd instanceof Object && cmd !== null;

export const isInsertActionCmd = (cmd: unknown): cmd is InsertActionCmd =>
  isCmdObject(cmd) && cmd.type === insertType;

export const isUpsertActionCmd = (cmd: unknown): cmd is UpsertActionCmd =>
  isCmdObject(cmd) && cmd.type === upsertType;

export const isDeleteActionCmd = (cmd: unknown): cmd is DeleteActionCmd =>
  isCmdObject(cmd) && cmd.type === deleteType;

export const isGetCurrentTraitsCmd = (
  cmd: unknown,
): cmd is GetCurrentTraitsCmd =>
  isCmdObject(cmd) && cmd.type === getCurrentTraitsType;

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
