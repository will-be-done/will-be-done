import { nanoid } from "nanoid";
import {
  asyncDispatch,
  BptreeInmemDriver,
  CachedDB,
  DB,
  deleteRows,
  execAsync,
  HyperDB,
  insert,
  SubscribableDB,
  syncDispatch,
  TableDefinition,
} from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import {
  changesSlice,
  changesTable,
  Change,
  ChangesetArrayType,
  syncSlice,
  BatchOp,
} from "@will-be-done/slices/common";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { tasksTable, taskProjectionsTable } from "@will-be-done/slices/space";
import { initAsyncDriver } from "./asyncDriver";
import {
  BroadcastChannel,
  createLeaderElection,
  LeaderElector,
} from "broadcast-channel";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators.ts";
import { trpcClient } from "@/lib/trpc.ts";
import { State } from "@/utils/State.ts";
import { AutoBackuper } from "./autoBackup.ts";

export interface SyncConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
  afterInit: (db: HyperDB) => void | Promise<void>;
  disableSync?: boolean;
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
    const primary = new DB(
      asyncDriver,
      [],
      [dbIdTrait(syncConfig.dbType, syncConfig.dbId)],
    );
    const cache = new DB(
      new BptreeInmemDriver(),
      [],
      [dbIdTrait(syncConfig.dbType, syncConfig.dbId)],
    );
    const cachedDB = new CachedDB(primary, cache);
    await execAsync(cachedDB.loadTables(syncConfig.persistDBTables));

    cachedDB.afterScan(
      function* (db, table, _indexName, _clauses, _selectOptions, results) {
        if (table === changesTable) return;
        if (results.length === 0) return;

        yield* db.intervalScan(
          changesTable,
          "byEntityIdAndTableName",
          results.map((r) => ({
            eq: [
              { col: "entityId", val: r.id },
              { col: "tableName", val: table.tableName },
            ],
          })),
        );

        if (table === tasksTable) {
          yield* db.intervalScan(
            taskProjectionsTable,
            "byIds",
            results.map((r) => ({
              eq: [{ col: "id", val: r.id }],
            })),
          );
        }
      },
    );

    const syncSubDb = new SubscribableDB(cachedDB);
    syncSubDb.afterInsert(function* (db, table, traits, ops) {
      if (table === changesTable) return;
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

    const bc = new BroadcastChannel(`changes-${getClientId(dbName)}`);

    // Create syncer early so we can reference it in the subscribe callback
    const syncer = new Syncer(
      primary,
      getClientId(dbName),
      syncConfig,
      nextClock,
      (e) => {
        void asyncDispatch(
          syncSubDb.withTraits({ type: "skip-sync" }),
          changesSlice.mergeChanges(
            e.changeset,
            nextClock,
            getClientId(dbName),
            syncConfig.tableNameMap,
          ),
        );
      },
    );

    syncSubDb.subscribe((ops, traits) => {
      ops = ops.filter((op) => op.table !== changesTable);
      if (ops.length === 0) return;

      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      void (async () => {
        type RowType = Record<string, string | number | boolean | null> & {
          id: string;
        };
        const changesByTable = new Map<
          string,
          Array<{ row?: RowType; change: Change }>
        >();

        // Group data operations by table and type for batching
        const insertsByTable = new Map<TableDefinition, RowType[]>();
        const updatesByTable = new Map<TableDefinition, RowType[]>();
        const deletesByTable = new Map<TableDefinition, string[]>();

        for (const op of ops) {
          if (op.table === changesTable) continue;

          if (op.type === "insert") {
            if (!insertsByTable.has(op.table)) insertsByTable.set(op.table, []);
            insertsByTable.get(op.table)!.push(op.newValue);
          } else if (op.type === "update") {
            if (!updatesByTable.has(op.table)) updatesByTable.set(op.table, []);
            updatesByTable.get(op.table)!.push(op.newValue);
          } else if (op.type === "delete") {
            if (!deletesByTable.has(op.table)) deletesByTable.set(op.table, []);
            deletesByTable.get(op.table)!.push(op.oldValue.id);
          }
        }

        const tx = await execAsync(primary.beginTx());

        console.log("start persistent tx update");
        // Batch insert/update/delete per table
        for (const [table, records] of insertsByTable) {
          await execAsync(tx.insert(table, records));
        }
        console.log("done persistent tx update");
        for (const [table, records] of updatesByTable) {
          await execAsync(tx.update(table, records));
        }
        for (const [table, ids] of deletesByTable) {
          await execAsync(tx.delete(table, ids));
        }

        // Batch change tracking
        const batchOps: BatchOp[] = ops
          .filter((op) => op.table !== changesTable)
          .map((op) => ({
            type: op.type,
            tableDef: op.table,
            newValue: op.type === "delete" ? undefined : op.newValue,
            oldValue: op.type === "insert" ? undefined : op.oldValue,
          }));

        console.log("start batch insert changes");
        const allChanges = await asyncDispatch(
          tx,
          changesSlice.batchInsertChanges(
            batchOps,
            getClientId(dbName),
            nextClock,
          ),
        );
        console.log("done batch insert changes");

        // Collect changes grouped by table for broadcast
        allChanges.forEach((change, i) => {
          if (!change) return;
          const op = batchOps[i];
          const tableName = change.tableName;
          if (!changesByTable.has(tableName)) {
            changesByTable.set(tableName, []);
          }
          const row = op.type === "delete" ? undefined : op.newValue;
          changesByTable.get(tableName)!.push({ row, change });
        });

        await execAsync(tx.commit());

        const changeset: ChangesetArrayType = [];
        for (const [tableName, data] of changesByTable) {
          changeset.push({ tableName, data });
        }

        if (changeset.length > 0) {
          void bc.postMessage({ changeset } satisfies ChangePersistedEvent);
        }

        // Notify syncer that local changes are persisted to trigger immediate sync
        syncer.forceSync();
      })();
    });

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

    if (!syncConfig.disableSync) {
      syncer.startLoop();

      const autoBackuper = new AutoBackuper(dbName, syncSubDb);
      autoBackuper.start();
    }

    await syncConfig.afterInit(syncSubDb);

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
  private wsUnsubscribe: (() => void) | null = null;

  // State-based sync triggers - emit to wake up the sync loop
  private wsNotification = new State<number>(0);
  private forceSyncNotification = new State<number>(0);

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
      this.cleanupWebSocket();
      void this.run();
    };

    void this.run();
  }

  /**
   * Called when local changes are persisted to trigger immediate sync
   */
  forceSync() {
    this.forceSyncNotification.set(0);
  }

  private cleanupWebSocket() {
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  private setupWebSocketSubscription() {
    // Subscribe to change notifications via tRPC subscription
    const subscription = trpcClient.onChangesAvailable.subscribe(
      {
        dbId: this.syncConfig.dbId,
        dbType: this.syncConfig.dbType,
      },
      {
        onData: () => {
          console.log("WebSocket notification received");
          this.wsNotification.set(0);
        },
        onError: (err) => {
          console.error("WebSocket subscription error:", err);
          // On error, emit to allow sync loop to continue
          this.wsNotification.set(0);
        },
      },
    );

    this.wsUnsubscribe = subscription.unsubscribe;
  }

  async run() {
    const myRunId = ++this.runId;

    await this.elector.awaitLeadership();

    // Setup WebSocket subscription once we become leader
    this.setupWebSocketSubscription();

    while (true) {
      if (this.runId !== myRunId) {
        console.log("runId !== myRunId, stopping syncer loop");
        this.cleanupWebSocket();
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

      // Use Promise.race between timeout, WebSocket notification, and local changes
      await Promise.race([
        // I disabled it for dev mode to reduce noise
        ...(process.env.NODE_ENV === "development"
          ? []
          : [
              new Promise<"timeout">((resolve) =>
                setTimeout(() => resolve("timeout"), 5000),
              ),
            ]),
        this.wsNotification.newEmitted().then(() => "ws" as const),
        this.forceSyncNotification.newEmitted().then(() => "local" as const),
      ]);
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
