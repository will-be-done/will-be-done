/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Row } from "../../core/primitives";
import type { TableDefinition } from "../../schema/table";

export const insertType = "insert";
export const upsertType = "upsert";
export const deleteType = "delete";
export const getCurrentTraitsType = "getCurrentTraits";

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
