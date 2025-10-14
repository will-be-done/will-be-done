import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { nanoid } from "nanoid";
import {
  action,
  asyncDispatch,
  AsyncSqlDriver,
  BptreeInmemDriver,
  DB,
  deleteRows,
  execAsync,
  execSync,
  HyperDB,
  insert,
  Row,
  runQuery,
  runSelectorAsync,
  selectFrom,
  selector,
  SubscribableDB,
  syncDispatch,
  table,
  update,
} from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import {
  changesSlice,
  changesTable,
  projectsSlice2,
  appSyncableTables,
  Change,
  syncableTablesMap,
  ChangesetArrayType,
  AppSyncableModel,
  taskTemplatesSlice2,
} from "@will-be-done/slices";
import * as SQLite from "wa-sqlite";
import { createTRPCClient, httpBatchLink, TRPCClient } from "@trpc/client";
import { AppRouter } from "@will-be-done/api";
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from "broadcast-channel";
import { groupBy, maxBy } from "es-toolkit";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { focusTable } from "./focusSlice";

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

const getClientId = () => {
  const id = localStorage.getItem("clientId");

  if (id) return id;

  const newId = nanoid();
  localStorage.setItem("clientId", newId);

  return newId;
};

async function initAsyncDriver() {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  const vfs = await IDBBatchAtomicVFS.create("my-db", module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("test-db");

  await sqlite3.exec(db, `PRAGMA cache_size=5000;`);
  await sqlite3.exec(db, `PRAGMA journal_mode=DELETE;`);

  // @ts-expect-error it's ok
  window.execQuery = async (q: string) => {
    const res: unknown[] = [];
    for await (const stmt of sqlite3.statements(db, q)) {
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const row = sqlite3.row(stmt);
        const record = JSON.parse(row[0] as string) as unknown;
        res.push(record);
      }
    }

    return res;
  };

  return new AsyncSqlDriver(sqlite3, db);
}

export type SyncState = {
  id: string;
  lastSentClock: string;
  lastServerAppliedClock: string;
};
const syncStateId = "deae72d6-ffca-4d20-9b3f-87e71acce8b6";
export const syncStateTable = table<SyncState>("syncState").withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

type GenReturn<T> = Generator<unknown, T, unknown>;
const syncSlice = {
  getOrDefault: selector(function* (): GenReturn<SyncState> {
    const currentSyncState = (yield* runQuery(
      selectFrom(syncStateTable, "byId").where((q) => q.eq("id", syncStateId)),
    ))[0];

    return (
      currentSyncState ?? {
        id: syncStateId,
        lastSentClock: "",
        lastServerAppliedClock: "",
      }
    );
  }),

  update: action(function* (updates: Partial<SyncState>): GenReturn<SyncState> {
    const currentSyncState = yield* syncSlice.getOrDefault();
    return yield* update(syncStateTable, [
      {
        ...currentSyncState,
        ...updates,
      },
    ]);
  }),
};

// TODO: next
// 1. Develop new sync protocol that will track changes in db
//    maybe just track last change of each column?
// the algo is such:
// 1. get diff time and check what columns are changed
// 2. select all rows that are changed from sync table
// 3. merge new changes diff
//
// Suppose you have such table:
// id | name | age
// 1  | bob  | 23
//
// It will have this sync_statuses table:
// id | recordId | table | changes                                    | isDeleted | clientId | lastChangedAt
// 31 | 1        | users | {id: "10:23", name: "10:23", age: "11:00"} | false     | a1       | 11:00
//
// So each row will have they own sync_status record. Both server and client will have this table.
//
// And then, the sync algo:
// 1. We send changes to server starting from last lastSentAt(preferences table) time,
// 2. Save new lastSentAt
// 3. We poll server for changes that happened after last serverAppliedClock.
//    Server even will send back changes that we sent on step 1 - it's ok for v1 of sync protocol
// 4. Save new serverAppliedClock
//
// This will allow to ensure server authority. On our change send server may
// perform thie own changes(uniq values unsurence for example), and send them to us.
//
//
// 1. We receive sync_statuses + rows of sync_statuses from server starting from last serverAppliedClock(preferences table) time
// 2. We take MAX(lastChangedAt) from sync_statuses of server and ours, and will
//    take client col change if it's higher than server change.
// 3. Then we send sync_statuses + rows of sync_statuses that lastChangedAt > lastSendAt(preferences table) to server and update lastSendAt to now
// 4. Store new serverAppliedClock and lastSendAt time in preferences table

//
// So we have sync table that for each column it will store last changed time of that column
//
const lock = new AwaitLock();
let initedDb: SubscribableDB | null = null;
export const initDbStore2 = async (): Promise<SubscribableDB> => {
  await lock.acquireAsync();
  try {
    if (initedDb) {
      return initedDb;
    }
    const asyncDriver = await initAsyncDriver();
    const asyncDB = new DB(asyncDriver);

    await execAsync(
      asyncDB.loadTables([
        ...appSyncableTables().map((t) => t.table),
        changesTable,
        syncStateTable,
      ]),
    );

    const syncDB = new DB(new BptreeInmemDriver());
    execSync(
      syncDB.loadTables([
        ...appSyncableTables().map((t) => t.table),
        changesTable,
        focusTable,
      ]),
    );

    const syncSubDb = new SubscribableDB(syncDB);
    syncSubDb.afterInsert(function* (db, table, traits, ops) {
      if (table === changesTable || table === focusTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        syncDispatch(
          db,
          changesSlice.insertChangeFromInsert(
            op.table,
            op.newValue,
            getClientId(),
            nextClock,
          ),
        );
      }

      yield* noop();
    });
    syncSubDb.afterUpdate(function* (db, table, traits, ops) {
      if (table === changesTable) return;
      if (table === changesTable || table === focusTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        syncDispatch(
          db,
          changesSlice.insertChangeFromUpdate(
            op.table,
            op.oldValue,
            op.newValue,
            getClientId(),
            nextClock,
          ),
        );
      }

      yield* noop();
    });
    syncSubDb.afterDelete(function* (db, table, traits, ops) {
      if (table === changesTable) return;
      if (table === changesTable || table === focusTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        syncDispatch(
          db,
          changesSlice.insertChangeFromDelete(
            op.table,
            op.oldValue,
            getClientId(),
            nextClock,
          ),
        );
      }

      yield* noop();
    });
    // TODO:
    // 1. DONE add support afterUpdate and afterDelete
    // 2. DONE merge backend receiving changesets with in-memory db

    const clientId = getClientId();
    const nextClock = initClock(clientId);

    for (const table of appSyncableTables()) {
      const res = await runSelectorAsync(asyncDB, function* () {
        return yield* runQuery(selectFrom(table.table, "byIds"));
      });

      // no need to broadcast to sub db
      execSync(syncDB.insert(table.table, res));
    }

    syncSubDb.subscribe((ops, traits) => {
      console.log("ops", ops);

      ops = ops.filter(
        (op) => op.table !== changesTable && op.table !== focusTable,
      );
      if (ops.length === 0) return;

      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      console.log("new changes from in-mem db", ops, traits);

      void (async () => {
        const tx = await execAsync(asyncDB.beginTx());
        for (const op of ops) {
          if (op.table == changesTable) continue;

          if (op.type === "insert") {
            await execAsync(tx.insert(op.table, [op.newValue]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromInsert(
                op.table,
                op.newValue,
                getClientId(),
                nextClock,
              ),
            );
          } else if (op.type === "update") {
            await execAsync(tx.update(op.table, [op.newValue]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromUpdate(
                op.table,
                op.oldValue,
                op.newValue,
                getClientId(),
                nextClock,
              ),
            );
          } else if (op.type === "delete") {
            await execAsync(tx.delete(op.table, [op.oldValue.id]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromDelete(
                op.table,
                op.oldValue,
                getClientId(),
                nextClock,
              ),
            );
          }
        }

        await execAsync(tx.commit());
      })();
    });

    new Syncer(asyncDB, getClientId(), nextClock, (e) => {
      syncDispatch(
        syncSubDb.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(e.changeset, nextClock, getClientId()),
      );

      void bc.postMessage(e);
    }).startLoop();

    syncDispatch(syncSubDb, projectsSlice2.createInboxIfNotExists());

    const bc = new BroadcastChannel(`changes-${getClientId()}3`);

    bc.onmessage = async (ev) => {
      const data = ev as ChangePersistedEvent;

      syncDispatch(
        syncSubDb.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(data.changeset, nextClock, getClientId()),
      );
    };

    void (async () => {
      while (true) {
        syncDispatch(
          syncSubDb,
          taskTemplatesSlice2.genTasksAndProjections(new Date()),
        );
        await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
      }
    })();

    initedDb = syncSubDb;

    return syncSubDb;
  } finally {
    lock.release();
  }
};

type ChangePersistedEvent = {
  changeset: ChangesetArrayType;
};

class Syncer {
  private client: TRPCClient<AppRouter>;
  private electionChannel: BroadcastChannel;
  private elector: LeaderElector;
  private runId = 0;
  private clientId: string;

  constructor(
    private persistentDB: HyperDB,
    clientId: string,
    private nextClock: () => string,
    private afterChangesPersisted: (e: ChangePersistedEvent) => void,
  ) {
    this.clientId = clientId;
    this.electionChannel = new BroadcastChannel("election-" + clientId);
    this.elector = createLeaderElection(this.electionChannel);
    this.client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: "/api/trpc",
        }),
      ],
    });
  }
  startLoop() {
    this.elector.onduplicate = () => {
      console.log("onduplicate");

      this.runId++;
      void this.run();
    };

    void this.run();
  }

  async run() {
    const myRunId = ++this.runId;

    await this.elector.awaitLeadership();
    while (true) {
      if (this.runId !== myRunId) {
        console.log("runId !== myRunId, stopping syncer loop");
        return;
      }
      try {
        console.log("sending changes to server");
        await this.sendChangesToServer();
        console.log("applying changes from server");
        await this.getAndApplyChanges();
      } catch (e) {
        console.error(e);
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  private async getAndApplyChanges() {
    const syncState = await asyncDispatch(
      this.persistentDB,
      syncSlice.getOrDefault(),
    );
    const serverChanges = await this.client.getChangesAfter.query({
      lastServerUpdatedAt: syncState.lastServerAppliedClock,
    });
    // TODO: apply change to in-memory db too
    // maybe need to merge changes in-memory and in async db on client too?

    // TODO: make server to not return changes of current client, otherwise
    // it will ruin real time editing experience.

    if (serverChanges.changesets.length === 0) {
      console.log("no changes from server");

      return;
    }

    console.log("new changes from server", serverChanges);

    const that = this;
    await asyncDispatch(
      this.persistentDB,
      (function* () {
        const { changesets } = yield* changesSlice.getChangesetAfter(
          syncState.lastSentClock,
        );
        if (changesets.length !== 0) {
          console.log(
            "some new client changes appeared, skipping server changes apply",
          );

          return;
        }

        const allChanges: Change[] = [];

        let maxNewClientClock = "";

        for (const changeset of serverChanges.changesets) {
          const toDeleteRows: string[] = [];
          // const toUpdateRows: AppSyncableModel[] = [];
          const toInsertRows: AppSyncableModel[] = [];

          const table = syncableTablesMap()[changeset.tableName];
          if (!table) {
            throw new Error("Unknown table: " + changeset.tableName);
          }

          for (const { change, row } of changeset.data) {
            if (change.deletedAt != null) {
              toDeleteRows.push(change.id);
            } else if (row) {
              toInsertRows.push(row as AppSyncableModel);
            }

            const currentClock = that.nextClock();

            if (currentClock > maxNewClientClock) {
              maxNewClientClock = currentClock;
            }

            allChanges.push({
              id: change.id,
              tableName: table.tableName,
              // TODO: use local createdAt value. Or maybe not?
              createdAt: change?.createdAt,
              updatedAt: currentClock,
              deletedAt: change?.deletedAt,
              clientId: that.clientId,
              changes: change.changes,
            });
          }

          yield* insert(table, toInsertRows);
          yield* deleteRows(table, toDeleteRows);
        }

        yield* insert(changesTable, allChanges);
        console.log("set clock", serverChanges.maxClock, maxNewClientClock);

        yield* syncSlice.update({
          lastServerAppliedClock: serverChanges.maxClock,
          lastSentClock: maxNewClientClock,
        });
      })(),
    );

    try {
      this.afterChangesPersisted({ changeset: serverChanges.changesets });
    } catch (e) {
      console.error(e);
    }
  }

  private async sendChangesToServer() {
    const { changesets, maxClock } = await asyncDispatch(
      this.persistentDB,
      (function* () {
        const currentSyncState = yield* syncSlice.getOrDefault();

        console.log(
          "get clock",
          currentSyncState.lastServerAppliedClock,
          currentSyncState.lastSentClock,
        );

        const { changesets, maxClock } = yield* changesSlice.getChangesetAfter(
          currentSyncState.lastSentClock,
        );

        console.log("new client changes", changesets, maxClock);

        return { changesets, maxClock };
      })(),
    );

    if (changesets.length === 0) {
      return;
    }

    console.log("sending changes to server", changesets, maxClock);

    await this.client.handleChanges.mutate(changesets);
    await asyncDispatch(
      this.persistentDB,
      syncSlice.update({ lastSentClock: maxClock }),
    );
  }
}
