import { getDbCtx } from "@/store/sync/db";
import { Q } from "@/store/sync/schema";
import { BptreeInmemDriver, DB, SubscribableDB } from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import { tables } from "./store";

const lock = new AwaitLock();
let initedDb: SubscribableDB | null = null;
export const initDbStore = async (): Promise<SubscribableDB> => {
  await lock.acquireAsync();
  try {
    if (initedDb) {
      return initedDb;
    }

    const db = new SubscribableDB(
      new DB(
        new BptreeInmemDriver(),
        tables.map((t) => t.table),
      ),
    );

    const dbCtx = await getDbCtx();
    for (const table of tables) {
      const rows = await dbCtx.db.runQuery(
        Q.selectFrom(table.table.tableName as "projects")
          .selectAll()
          .where("isDeleted", "=", 0),
      );

      const result = rows.map((row) => ({
        ...JSON.parse(row.data as unknown as string),
        type: table.modelType,
      }));
      db.insert(table.table, result);
    }

    initedDb = db;

    return db;
  } finally {
    lock.release();
  }
};
