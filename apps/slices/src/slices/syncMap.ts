import { AnyTable } from "./maps";

export const registeredSyncableModelTableMap: Record<string, AnyTable> = {};
export const registeredSyncableTableNameMap: Record<string, AnyTable> = {};
export const registeredSyncableTables: AnyTable[] = [];

export const registerSyncableTable = (table: AnyTable, modelType: string) => {
  registeredSyncableModelTableMap[modelType] = table;
  registeredSyncableTableNameMap[table.tableName] = table;
  registeredSyncableTables.push(table);
};
