import {
  changesSlice,
  changesTable,
  type Change,
  type ChangesetArrayType,
  type BatchOp,
} from "@will-be-done/slices/common";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SubscribableDB } from "./hyperdb/subscribable-db.ts";
import { DB, execAsync, syncDispatch, asyncDispatch } from "./hyperdb";
import type { TableDefinition } from "./hyperdb/table.ts";
import { noop } from "./hyperdb/generators";
import { projectsTable } from "./db.ts";
import { DBProvider } from "./react/context.ts";
import { BptreeInmemDriver } from "./hyperdb/drivers/bptree-inmem-driver.ts";
import { CachedDB } from "./hyperdb/cachedDB.ts";
import { initWasmIDBPersisted } from "./hyperdb/initWaSqlitePersisted.ts";
import { BroadcastChannel } from "broadcast-channel";

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

type ChangePersistedEvent = {
  changeset: ChangesetArrayType;
};

export const WrapApp = ({ children }: { children: React.ReactNode }) => {
  const [db, setDB] = useState<SubscribableDB | null>(null);

  useEffect(() => {
    void (async () => {
      const clientId = "hello";
      const primaryDriver = await initWasmIDBPersisted("hyperdb-test");
      const primary = new DB(primaryDriver);

      const cache = new DB(new BptreeInmemDriver());
      const cachedDB = new CachedDB(primary, cache);

      await execAsync(cachedDB.loadTables([projectsTable, changesTable]));

      const subDb = new SubscribableDB(cachedDB);

      const clockA = initClock("a");

      cachedDB.afterScan(
        function* (db, table, _indexName, _clauses, _selectOptions, results) {
          if (table === changesTable) return;

          if (results.length === 0) {
            return;
          }

          // NOTE: preloading all changes for found records so insert/update/delete will be instant
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
        },
      );

      subDb.afterInsert(function* (db, table, traits, ops) {
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
              clientId,
              clockA,
            ),
          );
        }

        yield* noop();
      });

      subDb.afterUpdate(function* (db, table, traits, ops) {
        if (table === changesTable) return;
        if (traits.some((t) => t.type === "skip-sync")) {
          return;
        }

        // TODO: maybe it witohut unwrap so it oculd be async/sync
        for (const op of ops) {
          syncDispatch(
            db,
            changesSlice.insertChangeFromUpdate(
              op.table,
              op.oldValue,
              op.newValue,
              clientId,
              clockA,
            ),
          );
        }

        yield* noop();
      });

      subDb.afterDelete(function* (db, table, traits, ops) {
        if (table === changesTable) return;
        if (traits.some((t) => t.type === "skip-sync")) {
          return;
        }

        // TODO: maybe it witohut unwrap so it oculd be async/sync
        for (const op of ops) {
          syncDispatch(
            db,
            changesSlice.insertChangeFromDelete(
              op.table,
              op.oldValue,
              clientId,
              clockA,
            ),
          );
        }

        yield* noop();
      });

      const bc = new BroadcastChannel(`changes-a`);

      bc.onmessage = async (ev) => {
        const data = ev as ChangePersistedEvent;

        console.log("bc-newMessage", data);
        void asyncDispatch(
          subDb.withTraits({ type: "skip-sync" }),
          changesSlice.mergeChanges(data.changeset, clockA, clientId, {
            projects: projectsTable,
          }),
        );
      };

      // TODO: make it ORDERED. Ottherwise inserts will be unordered
      subDb.subscribe((ops, traits) => {
        ops = ops.filter((op) => op.table !== changesTable);
        if (ops.length === 0) return;

        if (traits.some((t) => t.type === "skip-sync")) {
          return;
        }

        void (async () => {
          await new Promise((r) => setTimeout(r, 1000));

          // Map to collect changes grouped by table name
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
            if (op.table == changesTable) continue;

            if (op.type === "insert") {
              if (!insertsByTable.has(op.table))
                insertsByTable.set(op.table, []);
              insertsByTable.get(op.table)!.push(op.newValue);
            } else if (op.type === "update") {
              if (!updatesByTable.has(op.table))
                updatesByTable.set(op.table, []);
              updatesByTable.get(op.table)!.push(op.newValue);
            } else if (op.type === "delete") {
              if (!deletesByTable.has(op.table))
                deletesByTable.set(op.table, []);
              deletesByTable.get(op.table)!.push(op.oldValue.id);
            }
          }

          const tx = await execAsync(primary.beginTx());

          // Batch insert/update/delete per table
          for (const [table, records] of insertsByTable) {
            await execAsync(tx.insert(table, records));
          }
          for (const [table, records] of updatesByTable) {
            await execAsync(tx.update(table, records));
          }
          for (const [table, ids] of deletesByTable) {
            await execAsync(tx.delete(table, ids));
          }

          // Batch change tracking — single query + single insert
          const batchOps: BatchOp[] = ops
            .filter((op) => op.table != changesTable)
            .map((op) => ({
              type: op.type,
              tableDef: op.table,
              newValue: op.type === "delete" ? undefined : op.newValue,
              oldValue: op.type === "insert" ? undefined : op.oldValue,
            }));

          const allChanges = await asyncDispatch(
            tx,
            changesSlice.batchInsertChanges(batchOps, clientId, clockA),
          );

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
          // syncer.forceSync();
        })();
      });

      setDB(subDb);
    })();
  }, []);

  return db && <DBProvider value={db}>{children}</DBProvider>;
};

createRoot(document.getElementById("root")!).render(
  <WrapApp>
    <App />
  </WrapApp>,
);
