import { describe, expect, test } from "bun:test";
import {
  DB,
  execSync,
  SubscribableDB,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createSpace, spacesTable } from "@will-be-done/slices/user";
import { installSyncNotificationHook } from "../db/db";
import { subscriptionManager } from "../subscriptionManager";

describe("database sync notifications", () => {
  test("coalesces committed syncable changes into one notification", async () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([spacesTable]));
    installSyncNotificationHook(db, {
      dbId: "user-1",
      dbType: "user",
      tableNameMap: { [spacesTable.tableName]: spacesTable },
    });

    let notifications = 0;
    const unsubscribe = await subscriptionManager.subscribe(
      "user-1",
      "user",
      () => notifications++,
    );
    try {
      syncDispatch(db, createSpace({ name: "One" }));
      syncDispatch(db, createSpace({ name: "Two" }));
      expect(notifications).toBe(0);
      await Promise.resolve();
      expect(notifications).toBe(1);
    } finally {
      await unsubscribe();
    }
  });
});
