import {
  asyncDispatch,
  DB,
  execAsync,
  selectAsync,
} from "@will-be-done/hyperdb";
import {
  insertChangeFromInsert,
  changesTable,
  syncStateTable,
  ChangesetArrayType,
  migrateSyncV4Clocks,
  getLatestChangeCursor,
} from "@will-be-done/slices/common";
import { dbIdTrait } from "@will-be-done/slices/traits";
import {
  createInboxIfNotExists,
  createTaskInSection,
  firstProjectSectionChild,
  registeredSpaceSyncableTables,
  tasksTable,
  areSpaceStorageMigrationsApplied,
  migrateLegacySpaceStorage,
  spaceMigrationsTable,
  spaceStorageMigrationTables,
} from "@will-be-done/slices/space";
import { BroadcastChannel } from "broadcast-channel";
import { authUtils } from "@/lib/auth";
import {
  openPersistentDriver,
  resolvePersistentDriverKind,
} from "./persistentDriver";
import { getClientId, initClock } from "./syncClock";
import { syncChannelName } from "./syncCompatibility";
import { withStoreStartupLock } from "./storeDbs";

export async function initPopupStore(spaceId: string) {
  const dbName = "space-" + spaceId;
  const persistentDriverKind = await resolvePersistentDriverKind(dbName);
  const clientId = getClientId(dbName, persistentDriverKind);
  const nextClock = initClock(clientId);

  const persistDBTables = [
    ...registeredSpaceSyncableTables,
    changesTable,
    syncStateTable,
  ];

  const asyncDB = await withStoreStartupLock(dbName, async () => {
    const persistentDriver = await openPersistentDriver(dbName);
    const db = new DB(persistentDriver, {
      traits: [dbIdTrait("space", spaceId)],
    });

    await execAsync(db.loadTables([spaceMigrationsTable]));
    const migrationApplied = await selectAsync(db, {
      selector: areSpaceStorageMigrationsApplied,
      args: {},
    });
    if (!migrationApplied) {
      await execAsync(db.loadTables(spaceStorageMigrationTables));
      await asyncDispatch(db, migrateLegacySpaceStorage({}));
    }
    await execAsync(db.loadTables(persistDBTables));
    return db;
  });

  await asyncDispatch(
    asyncDB.withTraits({ type: "skip-sync" }),
    migrateSyncV4Clocks({}),
  );
  const latest = await asyncDispatch(asyncDB, getLatestChangeCursor({}));
  nextClock.observe([latest?.clock]);

  // Ensure inbox exists
  await asyncDispatch(asyncDB, createInboxIfNotExists({}));

  return {
    async createInboxTask(title: string) {
      const result = await asyncDispatch(
        asyncDB,
        (function* () {
          // Get inbox project
          const inbox = yield* createInboxIfNotExists({});

          // Get first section of inbox
          const inboxSection = yield* firstProjectSectionChild({
            projectId: inbox.id,
          });
          if (!inboxSection) {
            throw new Error("Inbox section not found");
          }

          // Create task at the top (prepend)
          const task = yield* createTaskInSection({
            projectSectionId: inboxSection.id,
            position: "prepend",
            taskAttrs: { title },
          });

          // Create change record
          const latest = yield* getLatestChangeCursor({});
          nextClock.observe([latest?.clock]);
          const change = yield* insertChangeFromInsert({
            tableDef: tasksTable,
            row: task,
            clientId: clientId,
            nextClock: nextClock(),
          });

          return { task, change };
        })(),
      );

      // Notify main window via BroadcastChannel
      const bc = new BroadcastChannel(syncChannelName("changes", clientId));
      const changeset: ChangesetArrayType = [
        {
          tableName: tasksTable.tableName,
          data: [{ row: result.task, change: result.change }],
        },
      ];
      await bc.postMessage({ changeset });
      await bc.close();

      return result.task;
    },
  };
}

export function getPopupSpaceId(): string | null {
  return authUtils.getLastUsedSpaceId();
}
