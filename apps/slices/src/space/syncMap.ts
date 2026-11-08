import { AnyTable } from "./tables";

export const registeredSpaceSyncableModelTableMap: Record<string, AnyTable> =
  {};
export const registeredSpaceSyncableTableNameMap: Record<string, AnyTable> = {};
export const registeredSpaceSyncableTables: AnyTable[] = [];
// Synced to clients but written only by the server; backups skip them.
export const serverOwnedSpaceTables = new Set<AnyTable>();

// TODO: use traits for schemas
export const registerSpaceSyncableTable = (
  table: AnyTable,
  modelType: string,
  { serverOwned = false }: { serverOwned?: boolean } = {},
) => {
  registeredSpaceSyncableModelTableMap[modelType] = table;
  registeredSpaceSyncableTableNameMap[table.tableName] = table;
  registeredSpaceSyncableTables.push(table);
  if (serverOwned) serverOwnedSpaceTables.add(table);
};
