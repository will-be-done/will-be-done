/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row, Trait } from "./db";
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

export type UpdateActionCmd = {
  type: typeof updateType;
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

export const isUpdateActionCmd = (cmd: unknown): cmd is UpdateActionCmd =>
  isCmdObject(cmd) && cmd.type === updateType;

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
