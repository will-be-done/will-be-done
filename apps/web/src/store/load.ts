import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { nanoid } from "nanoid";
import {
  asyncDispatch,
  AsyncSqlDriver,
  BptreeInmemDriver,
  DB,
  deleteRows,
  execAsync,
  execSync,
  HyperDB,
  insert,
  runQuery,
  runSelectorAsync,
  selectFrom,
  SubscribableDB,
  syncDispatch,
  TableDefinition,
} from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import {
  changesSlice,
  changesTable,
  Change,
  ChangesetArrayType,
  syncSlice,
} from "@will-be-done/slices/common";
import * as SQLite from "wa-sqlite";
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from "broadcast-channel";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators.ts";
import { focusTable } from "./focusSlice.ts";
import { trpcClient } from "@/lib/trpc.ts";

export interface SyncConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  inmemDBTables: TableDefinition[];
  syncableDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
  afterInit: (db: HyperDB) => void;
}

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

const getClientId = (dbName: string) => {
  const key = "clientId-" + dbName;

  const id = localStorage.getItem(key);

  if (id) return id;

  const newId = nanoid();
  localStorage.setItem(key, newId);

  return newId;
};

async function initAsyncDriver(dbName: string) {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  console.log("initAsyncDriver - spaceId", dbName);

  const vfs = await IDBBatchAtomicVFS.create("db-" + dbName, module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("db-" + dbName);

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
const initedDbs: Record<string, SubscribableDB> = {};
export const initDbStore = async (
  syncConfig: SyncConfig,
): Promise<SubscribableDB> => {
  const dbName = syncConfig.dbType + "-" + syncConfig.dbId;

  await lock.acquireAsync();
  try {
    if (initedDbs[dbName]) {
      return initedDbs[dbName];
    }
    const asyncDriver = await initAsyncDriver(dbName);
    const asyncDB = new DB(asyncDriver);

    await execAsync(asyncDB.loadTables(syncConfig.persistDBTables));

    const syncDB = new DB(new BptreeInmemDriver());

    execSync(syncDB.loadTables(syncConfig.inmemDBTables));

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
            getClientId(dbName),
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
            getClientId(dbName),
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
            getClientId(dbName),
            nextClock,
          ),
        );
      }

      yield* noop();
    });

    const clientId = getClientId(dbName);
    const nextClock = initClock(clientId);

    for (const table of syncConfig.syncableDBTables) {
      const res = await runSelectorAsync(asyncDB, function* () {
        return yield* runQuery(selectFrom(table, "byIds"));
      });

      // no need to broadcast to sub db
      execSync(syncDB.insert(table, res));
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
                getClientId(dbName),
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
                getClientId(dbName),
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
                getClientId(dbName),
                nextClock,
              ),
            );
          }
        }

        await execAsync(tx.commit());
      })();
    });

    const bc = new BroadcastChannel(`changes-${getClientId(dbName)}`);

    bc.onmessage = async (ev) => {
      const data = ev as ChangePersistedEvent;

      syncDispatch(
        syncSubDb.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(
          data.changeset,
          nextClock,
          getClientId(dbName),
          syncConfig.tableNameMap,
        ),
      );
    };

    new Syncer(asyncDB, getClientId(dbName), syncConfig, nextClock, (e) => {
      syncDispatch(
        syncSubDb.withTraits({ type: "skip-sync" }),
        changesSlice.mergeChanges(
          e.changeset,
          nextClock,
          getClientId(dbName),
          syncConfig.tableNameMap,
        ),
      );

      void bc.postMessage(e);
    }).startLoop();

    syncConfig.afterInit(syncSubDb);

    initedDbs[dbName] = syncSubDb;

    return syncSubDb;
  } finally {
    lock.release();
  }
};

type ChangePersistedEvent = {
  changeset: ChangesetArrayType;
};

class Syncer {
  private electionChannel: BroadcastChannel;
  private elector: LeaderElector;
  private runId = 0;
  private clientId: string;
  private syncConfig: SyncConfig;

  constructor(
    private persistentDB: HyperDB,
    clientId: string,
    syncConfig: SyncConfig,
    private nextClock: () => string,
    private afterChangesPersisted: (e: ChangePersistedEvent) => void,
  ) {
    this.clientId = clientId;
    this.syncConfig = syncConfig;
    this.electionChannel = new BroadcastChannel("election-" + clientId);
    this.elector = createLeaderElection(this.electionChannel);
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
    const serverChanges = await trpcClient.getChangesAfter.query({
      lastServerUpdatedAt: syncState.lastServerAppliedClock,
      dbId: this.syncConfig.dbId,
      dbType: this.syncConfig.dbType,
    });
    // TODO: make server to not return changes of current client, otherwise
    // it will ruin real time editing experience.

    if (serverChanges.changesets.length === 0) {
      console.log("no changes from server");

      return;
    }

    console.log("new changes from server", serverChanges);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
    await asyncDispatch(
      this.persistentDB,
      (function* () {
        const { changesets } = yield* changesSlice.getChangesetAfter(
          syncState.lastSentClock,
          that.syncConfig.tableNameMap,
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
          const toInsertRows: { id: string; [key: string]: unknown }[] = [];

          const table = that.syncConfig.tableNameMap[changeset.tableName];
          if (!table) {
            throw new Error("Unknown table: " + changeset.tableName);
          }

          for (const { change, row } of changeset.data) {
            if (change.deletedAt != null) {
              toDeleteRows.push(change.entityId);
            } else if (row) {
              toInsertRows.push(row);
            }

            const currentClock = that.nextClock();

            if (currentClock > maxNewClientClock) {
              maxNewClientClock = currentClock;
            }

            allChanges.push({
              id: change.id,
              entityId: change.entityId,
              tableName: table.tableName,
              // TODO: use local createdAt value. Or maybe not?
              createdAt: change?.createdAt,
              updatedAt: currentClock,
              deletedAt: change?.deletedAt,
              clientId: that.clientId,
              changes: change.changes,
            });
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          yield* insert(table, toInsertRows as any);
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this;
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
          that.syncConfig.tableNameMap,
        );

        console.log("new client changes", changesets, maxClock);

        return { changesets, maxClock };
      })(),
    );

    if (changesets.length === 0) {
      return;
    }

    console.log("sending changes to server", changesets, maxClock);

    await trpcClient.handleChanges.mutate({
      dbId: this.syncConfig.dbId,
      dbType: this.syncConfig.dbType,
      changeset: changesets,
    });
    await asyncDispatch(
      this.persistentDB,
      syncSlice.update({ lastSentClock: maxClock }),
    );
  }
}
