import { describe, expect, test } from "bun:test";
import {
  DB,
  execSync,
  SubscribableDB,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createSpace, spacesTable } from "@will-be-done/slices/user";
import { createAppRouter } from "../appRouter";
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

  test("delivers a notification received while the previous one is yielded", async () => {
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
    }).createCaller({
      user: { id: "user-1", email: "user@example.com" },
    });
    const subscription = await caller.onChangesAvailable({
      dbId: "user-1",
      dbType: "user",
      syncVersion: 4,
    });
    const iterator = subscription[Symbol.asyncIterator]();

    try {
      const firstResult = iterator.next();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await subscriptionManager.notifyChangesAvailable("user-1", "user");
      expect(await firstResult).toMatchObject({
        done: false,
        value: { dbId: "user-1", dbType: "user" },
      });

      await subscriptionManager.notifyChangesAvailable("user-1", "user");
      expect(await iterator.next()).toMatchObject({
        done: false,
        value: { dbId: "user-1", dbType: "user" },
      });
    } finally {
      await iterator.return?.();
    }
  });

  test("stops waiting when the subscription is cancelled", async () => {
    const controller = new AbortController();
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
    }).createCaller(
      { user: { id: "user-1", email: "user@example.com" } },
      { signal: controller.signal },
    );
    const subscription = await caller.onChangesAvailable({
      dbId: "user-1",
      dbType: "user",
      syncVersion: 4,
    });
    const iterator = subscription[Symbol.asyncIterator]();

    try {
      const pendingResult = iterator.next();
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();

      let cancellationError: unknown;
      try {
        await pendingResult;
      } catch (error) {
        cancellationError = error;
      }
      expect(cancellationError).toHaveProperty("name", "AbortError");
    } finally {
      controller.abort();
      await iterator.return?.();
    }
  });
});
