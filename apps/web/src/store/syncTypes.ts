import type { Effect, Scope } from "effect";
import type { Database, DatabaseError } from "./database";
import { TableDefinition } from "@will-be-done/hyperdb";
import type { ChangesetArrayType } from "@will-be-done/slices/common";

export interface SyncConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  syncableDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
  // Run in the store's scope: work forked there stops with the store.
  beforeInit?: Effect.Effect<void, DatabaseError, Database | Scope.Scope>;
  afterInit: Effect.Effect<void, DatabaseError, Database | Scope.Scope>;
  disableSync?: boolean;
}

export type ChangePersistedEvent = {
  changeset: ChangesetArrayType;
};
