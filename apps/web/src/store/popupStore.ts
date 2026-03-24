import { nanoid } from "nanoid";
import {
  asyncDispatch,
  DB,
  execAsync,
} from "@will-be-done/hyperdb";
import {
  changesSlice,
  changesTable,
  syncStateTable,
  ChangesetArrayType,
} from "@will-be-done/slices/common";
import { dbIdTrait } from "@will-be-done/slices/traits";
import {
  projectsSlice,
  projectCategoriesSlice,
  registeredSpaceSyncableTables,
  tasksTable,
} from "@will-be-done/slices/space";
import { BroadcastChannel } from "broadcast-channel";
import { initAsyncDriver } from "./asyncDriver";
import { authUtils } from "@/lib/auth";

const getClientId = (dbName: string) => {
  const key = "clientId-" + dbName;
  const id = localStorage.getItem(key);
  if (id) return id;
  const newId = nanoid();
  localStorage.setItem(key, newId);
  return newId;
};

const initClock = (clientId: string) => {
  let now = Date.now();
  let n = 0;
  return () => {
    const newNow = Date.now();
    if (newNow === now) {
      n++;
    } else if (newNow > now) {
      now = newNow;
      n = 0;
    }
    return `${now}-${n.toString().padStart(4, "0")}-${clientId}`;
  };
};

export async function initPopupStore(spaceId: string) {
  const dbName = "space-" + spaceId;
  const clientId = getClientId(dbName);
  const nextClock = initClock(clientId);

  const persistDBTables = [
    ...registeredSpaceSyncableTables,
    changesTable,
    syncStateTable,
  ];

  const asyncDriver = await initAsyncDriver(dbName);
  const asyncDB = new DB(
    asyncDriver,
    [],
    [dbIdTrait("space", spaceId)],
  );

  await execAsync(asyncDB.loadTables(persistDBTables));

  // Ensure inbox exists
  await asyncDispatch(asyncDB, projectsSlice.createInboxIfNotExists());

  return {
    async createInboxTask(title: string) {
      const result = await asyncDispatch(
        asyncDB,
        (function* () {
          // Get inbox project
          const inbox = yield* projectsSlice.createInboxIfNotExists();

          // Get first category of inbox
          const inboxCategory = yield* projectCategoriesSlice.firstChild(
            inbox.id,
          );
          if (!inboxCategory) {
            throw new Error("Inbox category not found");
          }

          // Create task at the top (prepend)
          const task = yield* projectCategoriesSlice.createTask(
            inboxCategory.id,
            "prepend",
            { title },
          );

          // Create change record
          const change = yield* changesSlice.insertChangeFromInsert(
            tasksTable,
            task,
            clientId,
            nextClock,
          );

          return { task, change };
        })(),
      );

      // Notify main window via BroadcastChannel
      const bc = new BroadcastChannel(`changes-${clientId}`);
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
