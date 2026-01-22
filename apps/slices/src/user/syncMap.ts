import { AnyTable } from "./maps";

export const registeredUserSyncableModelTableMap: Record<string, AnyTable> = {};
export const registeredUserSyncableTableNameMap: Record<string, AnyTable> = {};
export const registeredUserSyncableTables: AnyTable[] = [];

export const registerUserSyncableTable = (
  table: AnyTable,
  modelType: string,
) => {
  registeredUserSyncableModelTableMap[modelType] = table;
  registeredUserSyncableTableNameMap[table.tableName] = table;
  registeredUserSyncableTables.push(table);
};
