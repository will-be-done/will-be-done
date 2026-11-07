import type { Effect, Scope } from "effect";
import { SubscribableDB } from "@will-be-done/hyperdb";
import { TableDefinition } from "@will-be-done/hyperdb";
import type { ChangesetArrayType } from "@will-be-done/slices/common";

export interface SyncConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  syncableDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
  // Run in the store's scope: work forked there stops with the store.
  beforeInit?: (db: SubscribableDB) => Effect.Effect<void, never, Scope.Scope>;
  afterInit: (db: SubscribableDB) => Effect.Effect<void, never, Scope.Scope>;
  disableSync?: boolean;
}

export type ChangePersistedEvent = {
  changeset: ChangesetArrayType;
};
