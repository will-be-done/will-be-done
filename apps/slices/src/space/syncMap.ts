import { AnyTable } from "./maps";

export const registeredSpaceSyncableModelTableMap: Record<string, AnyTable> =
  {};
export const registeredSpaceSyncableTableNameMap: Record<string, AnyTable> = {};
export const registeredSpaceSyncableTables: AnyTable[] = [];

export const registerSpaceSyncableTable = (
  table: AnyTable,
  modelType: string,
) => {
  registeredSpaceSyncableModelTableMap[modelType] = table;
  registeredSpaceSyncableTableNameMap[table.tableName] = table;
  registeredSpaceSyncableTables.push(table);
};
