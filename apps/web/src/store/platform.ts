import { BroadcastChannel, createLeaderElection } from "broadcast-channel";
import type {
  ClientPlatform,
  SyncLeaderElector,
} from "@will-be-done/client/sync";
import { trpcClient } from "@/lib/trpc";
import { authUtils } from "@/lib/auth";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { webStorage } from "@/lib/webStorage";
import { AutoBackuper } from "./autoBackup";
import {
  openPersistentDriver,
  resolvePersistentDriverKind,
} from "./persistentDriver";

export const webPlatform: ClientPlatform = {
  apiUrl: "",
  getToken: () => authUtils.getToken(),
  storage: webStorage,
  persistentStorage: {
    resolveKind: resolvePersistentDriverKind,
    openDriver: openPersistentDriver,
  },
  subscribeChangesAvailable: (input, handlers) =>
    trpcClient.onChangesAvailable.subscribe(input, handlers),
  coordination: {
    createChannel: (name) => new BroadcastChannel(name),
    createLeaderElection: (channel) =>
      createLeaderElection(
        channel as BroadcastChannel,
      ) as unknown as SyncLeaderElector,
  },
  lifecycle: {
    onWake: (callback) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") callback();
      });
      window.addEventListener("online", callback);
      window.addEventListener("focus", callback);
    },
    onHide: (callback) => {
      window.addEventListener("beforeunload", callback, { capture: true });
      window.addEventListener("pagehide", callback, { capture: true });
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState === "hidden") callback();
        },
        { capture: true },
      );
    },
  },
  isDebugEnabled: () =>
    getDevtoolsEnabled() || process.env.NODE_ENV === "development",
  startAutoBackup: (dbName, db) => {
    new AutoBackuper(dbName, db).start();
  },
};
