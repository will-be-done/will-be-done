import {
  asyncDispatch,
  DB,
  execAsync,
  PreloadedHybridDB,
  selectAsync,
  SubscribableDB,
} from "@will-be-done/hyperdb";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { openPersistentDriver } from "./persistentDriver";
import type { SyncConfig } from "./syncTypes";
import {
  areSpaceStorageMigrationsApplied,
  migrateLegacySpaceStorage,
  spaceMigrationsTable,
  spaceStorageMigrationTables,
} from "@will-be-done/slices/space";

const startupQueues = new Map<string, Promise<void>>();

export async function withStoreStartupLock<T>(
  dbName: string,
  callback: () => Promise<T>,
): Promise<T> {
  const lockName = `will-be-done:store-startup:${dbName}`;
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(lockName, callback);
  }

  const previous = startupQueues.get(lockName) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(callback);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  startupQueues.set(lockName, settled);

  try {
    return await result;
  } finally {
    if (startupQueues.get(lockName) === settled) {
      startupQueues.delete(lockName);
    }
  }
}

export const createStoreDbs = async (
  dbName: string,
  syncConfig: SyncConfig,
  preparePersistentDB?: (db: DB) => Promise<void>,
) => {
  const tracer =
    process.env.NODE_ENV === "development" || getDevtoolsEnabled()
      ? "default"
      : "disabled";

  const persistentDB = await withStoreStartupLock(dbName, async () => {
    const persistentDriver = await openPersistentDriver(dbName);
    const createPersistentDB = (dbName: string) =>
      new DB(persistentDriver, {
        traits: [dbIdTrait(syncConfig.dbType, syncConfig.dbId)],
        tracer,
        runtimeRowsValidation: process.env.NODE_ENV === "development",
        freezeArgs: process.env.NODE_ENV === "development",
        freezeRows: process.env.NODE_ENV === "development",
        dbName,
      });

    if (syncConfig.dbType === "space") {
      const migrationDB = createPersistentDB("migration");
      await execAsync(migrationDB.loadTables([spaceMigrationsTable]));
      const migrationApplied = await selectAsync(migrationDB, {
        selector: areSpaceStorageMigrationsApplied,
        args: {},
      });

      if (!migrationApplied) {
        await execAsync(migrationDB.loadTables(spaceStorageMigrationTables));
        await asyncDispatch(migrationDB, migrateLegacySpaceStorage({}));
      }
    }

    const db = createPersistentDB("persistent");
    await execAsync(db.loadTables(syncConfig.persistDBTables));
    await preparePersistentDB?.(db);
    return db;
  });

  const preloadedDB = new PreloadedHybridDB(persistentDB);
  const syncSubDb = new SubscribableDB(preloadedDB);
  await execAsync(syncSubDb.loadTables(syncConfig.persistDBTables));

  // const canPreloadChanges = syncConfig.persistDBTables.includes(changesTable);
  // const canPreloadDailyEntries =
  //   syncConfig.persistDBTables.includes(dailyEntriesTable);

  // syncSubDb.afterScan(
  //   function* (_db, table, _indexName, _clauses, _selectOptions, results) {
  //     if (
  //       !canPreloadChanges ||
  //       table === changesTable ||
  //       results.length === 0
  //     ) {
  //       return;
  //     }
  //
  //     yield* preloadEntities({
  //       ids: results.map((row) => row.id),
  //       tableName: table.tableName,
  //       preloadDailyEntries:
  //         table === tasksTable && canPreloadDailyEntries,
  //     });
  //   },
  // );

  return { persistentDB, syncSubDb };
};
