import {
  defineTable,
  deleteRows,
  type ExtractSchema,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import {
  changesTable,
  syncStateId,
  syncStateTable,
  type Change,
} from "../common/tables";
import { genUUIDV5 } from "../traits";
import { dailyEntryType, spaceMigrationsTable, stashEntryType } from "./tables";

export const legacyDailyEntriesTableName = "task_projections";
export const dailyEntriesTableName = "daily_entries";
export const legacyStashEntriesTableName = "stash_projections";
export const stashEntriesTableName = "stash_entries";
export const entryStorageMigrationId = "entry-storage-v1";
export const entryIdentityMigrationId = "entry-identity-v2";

export const legacyDailyEntriesMigrationTable = defineTable(
  legacyDailyEntriesTableName,
  {
    type: v.literal("projection"),
    id: v.string(),
    orderToken: v.string(),
    dailyListId: v.string(),
    createdAt: v.number(),
  },
).index("byIds", ["id"]);

export const legacyStashEntriesMigrationTable = defineTable(
  legacyStashEntriesTableName,
  {
    type: v.literal("stashProjection"),
    id: v.string(),
    orderToken: v.string(),
    createdAt: v.number(),
  },
).index("byIds", ["id"]);

export const dailyEntriesMigrationTable = defineTable(dailyEntriesTableName, {
  type: v.literal(dailyEntryType),
  id: v.string(),
  taskId: v.optional(v.string()),
  orderToken: v.string(),
  dailyListId: v.string(),
  createdAt: v.number(),
}).index("byIds", ["id"]);

export const stashEntriesMigrationTable = defineTable(stashEntriesTableName, {
  type: v.literal(stashEntryType),
  id: v.string(),
  taskId: v.optional(v.string()),
  orderToken: v.string(),
  createdAt: v.number(),
}).index("byIds", ["id"]);

export const entryStorageMigrationTables = [
  legacyDailyEntriesMigrationTable,
  dailyEntriesMigrationTable,
  legacyStashEntriesMigrationTable,
  stashEntriesMigrationTable,
  changesTable,
  syncStateTable,
  spaceMigrationsTable,
];

export const isEntryStorageMigrationApplied = selector({
  name: "isEntryStorageMigrationApplied",
  args: {},
  handler: function* isEntryStorageMigrationApplied() {
    return Boolean(
      yield* selectFrom(spaceMigrationsTable, "byId")
        .where((q) => q.eq("id", entryStorageMigrationId))
        .firstOr(null),
    );
  },
});

export const migrateLegacyEntries = action({
  name: "migrateLegacyEntries",
  args: {},
  handler: function* migrateLegacyEntries() {
    const existingMigration = yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", entryStorageMigrationId))
      .firstOr(null);
    if (existingMigration) return;

    const currentDailyEntryIds = new Set(
      (yield* selectFrom(dailyEntriesMigrationTable, "byIds")).map(
        (row) => row.id,
      ),
    );
    const dailyEntriesToInsert = (yield* selectFrom(
      legacyDailyEntriesMigrationTable,
      "byIds",
    ))
      .filter((row) => !currentDailyEntryIds.has(row.id))
      .map((row) => ({
        ...row,
        type: dailyEntryType as "dailyEntry",
      }));
    if (dailyEntriesToInsert.length > 0) {
      yield* insert(dailyEntriesMigrationTable, dailyEntriesToInsert);
    }

    const currentStashEntryIds = new Set(
      (yield* selectFrom(stashEntriesMigrationTable, "byIds")).map(
        (row) => row.id,
      ),
    );
    const stashEntriesToInsert = (yield* selectFrom(
      legacyStashEntriesMigrationTable,
      "byIds",
    ))
      .filter((row) => !currentStashEntryIds.has(row.id))
      .map((row) => ({
        ...row,
        type: stashEntryType as "stashEntry",
      }));
    if (stashEntriesToInsert.length > 0) {
      yield* insert(stashEntriesMigrationTable, stashEntriesToInsert);
    }

    const changes = (yield* selectFrom(
      changesTable,
      "byUpdatedAtId",
    )) as Change[];
    const changeIds = new Set(changes.map((change) => change.id));
    const changesToUpsert: Change[] = [];
    const changeIdsToDelete: string[] = [];

    for (const change of changes) {
      const nextTableName =
        change.tableName === legacyDailyEntriesTableName
          ? dailyEntriesTableName
          : change.tableName === legacyStashEntriesTableName
            ? stashEntriesTableName
            : null;
      if (!nextTableName) continue;

      const nextId = `${nextTableName}:${change.entityId}`;
      changeIdsToDelete.push(change.id);
      if (changeIds.has(nextId)) continue;

      changesToUpsert.push({
        ...change,
        id: nextId,
        tableName: nextTableName,
      });
    }

    if (changesToUpsert.length > 0) {
      yield* upsert(changesTable, changesToUpsert);
    }
    if (changeIdsToDelete.length > 0) {
      yield* deleteRows(changesTable, changeIdsToDelete);
    }

    yield* upsert(spaceMigrationsTable, [
      {
        id: entryStorageMigrationId,
        appliedAt: Date.now(),
      },
    ]);
  },
});

export const isEntryIdentityMigrationApplied = selector({
  name: "isEntryIdentityMigrationApplied",
  args: {},
  handler: function* isEntryIdentityMigrationApplied() {
    return Boolean(
      yield* selectFrom(spaceMigrationsTable, "byId")
        .where((q) => q.eq("id", entryIdentityMigrationId))
        .firstOr(null),
    );
  },
});

type LegacyEntry = {
  id: string;
  taskId?: string;
  type: "dailyEntry" | "stashEntry";
  createdAt: number;
  orderToken: string;
  dailyListId?: string;
};
type DailyEntryMigrationRow = ExtractSchema<typeof dailyEntriesMigrationTable>;
type StashEntryMigrationRow = ExtractSchema<typeof stashEntriesMigrationTable>;

const migrateEntryRows = action({
  name: "migrateEntryIdentityRows",
  args: {
    tableName: v.string(),
    modelType: v.union(v.literal(dailyEntryType), v.literal(stashEntryType)),
  },
  handler: function* migrateEntryRows({ tableName, modelType }) {
    const table =
      modelType === dailyEntryType
        ? dailyEntriesMigrationTable
        : stashEntriesMigrationTable;
    const rows = (yield* selectFrom(table, "byIds")) as LegacyEntry[];
    const legacyRows = rows.filter((row) => row.taskId === undefined);
    if (legacyRows.length === 0) return;

    const changes = (yield* selectFrom(
      changesTable,
      "byUpdatedAtId",
    )) as Change[];
    const changesByEntityId = new Map(
      changes
        .filter((change) => change.tableName === tableName)
        .map((change) => [change.entityId, change]),
    );
    const nextRows: LegacyEntry[] = [];
    const nextChanges: Change[] = [];

    for (const row of legacyRows) {
      const nextId = yield* genUUIDV5(`${modelType}-identity-v2`, row.id);
      nextRows.push({ ...row, id: nextId, taskId: row.id });

      const oldChange = changesByEntityId.get(row.id);
      if (!oldChange) continue;

      const identityClock = oldChange.changes.id ?? oldChange.createdAt;
      nextChanges.push(
        {
          ...oldChange,
          deletedAt: oldChange.deletedAt ?? oldChange.updatedAt,
        },
        {
          ...oldChange,
          id: `${tableName}:${nextId}`,
          entityId: nextId,
          deletedAt: null,
          changes: {
            ...oldChange.changes,
            id: identityClock,
            taskId: identityClock,
          },
        },
      );
    }

    yield* deleteRows(
      table,
      legacyRows.map((row) => row.id),
    );
    if (modelType === dailyEntryType) {
      yield* upsert(
        dailyEntriesMigrationTable,
        nextRows as DailyEntryMigrationRow[],
      );
    } else {
      yield* upsert(
        stashEntriesMigrationTable,
        nextRows as StashEntryMigrationRow[],
      );
    }
    if (nextChanges.length > 0) yield* upsert(changesTable, nextChanges);
  },
});

export const migrateEntryIdentity = action({
  name: "migrateEntryIdentity",
  args: {},
  handler: function* migrateEntryIdentity() {
    const existingMigration = yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", entryIdentityMigrationId))
      .firstOr(null);
    if (existingMigration) return;

    yield* migrateEntryRows({
      tableName: dailyEntriesTableName,
      modelType: dailyEntryType,
    });
    yield* migrateEntryRows({
      tableName: stashEntriesTableName,
      modelType: stashEntryType,
    });
    yield* upsert(syncStateTable, [
      {
        id: syncStateId,
        lastSentClock: "",
        lastServerAppliedClock: "",
      },
    ]);
    yield* upsert(spaceMigrationsTable, [
      { id: entryIdentityMigrationId, appliedAt: Date.now() },
    ]);
  },
});
