import { describe, expect, mock, test } from "bun:test";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import {
  TRASH_RETENTION_MS,
  trashedTasksTable,
  trashedTaskType,
} from "@will-be-done/slices/space";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { runSyncMaintenance } from "./maintenance";
import { serverSyncTables, syncUploadSessionsTable } from "./tables";

const testAction = createAction();
const seedExpiredUploads = testAction({
  name: "seedExpiredUploadsForMaintenance",
  args: {},
  handler: function* () {
    yield* upsert(
      syncUploadSessionsTable,
      ["one", "two"].map((id) => ({
        id,
        userId: "user-1",
        clientId: "client-1",
        baseClientClock: null,
        baseClientChangeId: null,
        downloadFromRevision: 0,
        status: "uploading" as const,
        expiresAt: 1,
        uploadedChangeCount: 0,
        uploadedByteCount: 0,
        maxObservedClock: null,
        maxClientClock: null,
        maxClientChangeId: null,
        resultJson: null,
      })),
    );
  },
});

const trashIds = createSelector()({
  name: "trashIdsForMaintenance",
  args: {},
  handler: function* () {
    return yield* selectFrom(trashedTasksTable, "byIds");
  },
});

const createSyncDb = () => {
  const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
  execSync(db.loadTables([...serverSyncTables]));
  return db;
};

const createLogger = () => ({
  error: mock((..._args: unknown[]) => {}),
  info: mock((..._args: unknown[]) => {}),
});

describe("sync v4 maintenance", () => {
  test("drains multiple expired sessions in one maintenance call", async () => {
    const db = createSyncDb();
    syncDispatch(db, seedExpiredUploads({}));
    const logger = createLogger();

    await runSyncMaintenance(logger as never, [
      { database: "good", dbType: "user", db },
    ]);

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toMatchObject({
      database: "good",
      cleanup: {
        uploads: 2,
        downloads: 0,
        deletedRows: 2,
        hasMore: false,
        passes: 2,
      },
      totalBytes: 0,
    });
  });

  test("logs one database failure and continues with later databases", async () => {
    const broken = new SubscribableDB(new DB(new BptreeInmemDriver()));
    const good = createSyncDb();
    syncDispatch(good, seedExpiredUploads({}));
    const logger = createLogger();

    await runSyncMaintenance(logger as never, [
      { database: "broken", dbType: "user", db: broken },
      { database: "good-after-broken", dbType: "user", db: good },
    ]);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0]).toMatchObject({
      database: "broken",
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0]?.[0]).toMatchObject({
      database: "good-after-broken",
      cleanup: { uploads: 2, hasMore: false },
    });
  });

  test("purges expired trash in space databases", async () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([...serverSyncTables, trashedTasksTable]));
    const trashedAt = Date.now() - TRASH_RETENTION_MS;
    syncDispatch(
      db,
      testAction({
        name: "seedTrashForMaintenance",
        args: {},
        handler: function* () {
          yield* upsert(
            trashedTasksTable,
            [
              { id: "expired", trashedAt: trashedAt - 60_000 },
              { id: "recent", trashedAt: trashedAt + 60_000 },
            ].map((row) => ({ ...row, type: trashedTaskType, snapshot: "{}" })),
          );
        },
      })({}),
    );

    await runSyncMaintenance(createLogger() as never, [
      { database: "space", dbType: "space", db },
    ]);

    expect(
      selectSync(db, { selector: trashIds, args: {} }).map(({ id }) => id),
    ).toEqual(["recent"]);
  });
});
