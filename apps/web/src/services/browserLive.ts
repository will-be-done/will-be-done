import { CURRENT_SYNC_VERSION } from "@will-be-done/slices/common";
import { BroadcastChannel, createLeaderElection } from "broadcast-channel";
import { Effect, Layer, Queue, References, Stream } from "effect";
import { Digest } from "effect/crypto";
import { FetchHttpClient } from "effect/http";
import { authUtils } from "@/lib/auth";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { trpcClient } from "@/lib/trpc";
import { isUnsupportedSyncVersionError } from "@/store/syncCompatibility";
import {
  AuthSession,
  BackupDatabase,
  PageEvents,
  ServerChanges,
  TabChannels,
  type TabChannel,
} from "./browser";

export const AuthSessionLive = Layer.succeed(AuthSession, {
  token: Effect.sync(() => authUtils.getToken()),
  id: Effect.sync(
    () => `${authUtils.getUserId() ?? ""}:${authUtils.getToken() ?? ""}`,
  ),
});

export const ServerChangesLive = Layer.succeed(ServerChanges, {
  watch: ({ dbId, dbType }) =>
    Stream.callback((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          trpcClient.onChangesAvailable.subscribe(
            { dbId, dbType, syncVersion: CURRENT_SYNC_VERSION },
            {
              onData: () =>
                Queue.offerUnsafe(queue, { _tag: "ChangesAvailable" }),
              onError: (cause) =>
                Queue.offerUnsafe(
                  queue,
                  isUnsupportedSyncVersionError(cause)
                    ? { _tag: "UpdateRequired" }
                    : { _tag: "Failed", cause },
                ),
            },
          ),
        ),
        (subscription) => Effect.sync(() => subscription.unsubscribe()),
      ),
    ),
});

const openChannel = <A>(name: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new BroadcastChannel<A>(name)),
    (channel) => Effect.promise(() => channel.close()),
  );

const listenTo = <A>(
  channel: BroadcastChannel<A>,
  handler: (message: A) => void,
) =>
  Effect.acquireRelease(
    Effect.sync(() => channel.addEventListener("message", handler)),
    () => Effect.sync(() => channel.removeEventListener("message", handler)),
  );

export const TabChannelsLive = Layer.succeed(TabChannels, {
  channel: <A>(name: string) =>
    Effect.map(
      openChannel<A>(name),
      (channel): TabChannel<A> => ({
        post: (message) => void channel.postMessage(message),
        listen: (handler) => listenTo(channel, handler),
      }),
    ),
  leadership: (name) =>
    Effect.gen(function* () {
      const channel = yield* openChannel<unknown>(name);
      const elector = yield* Effect.acquireRelease(
        Effect.sync(() => createLeaderElection(channel)),
        (elector) => Effect.promise(() => elector.die()),
      );
      return {
        isLeader: () => elector.isLeader,
        awaitLeadership: Effect.promise(() => elector.awaitLeadership()),
        onDuplicate: (handler) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              elector.onduplicate = handler;
            }),
            () =>
              Effect.sync(() => {
                elector.onduplicate = () => {};
              }),
          ),
      };
    }),
});

export const PageEventsLive = Layer.succeed(PageEvents, {
  listen: (target, type, handler, options) => {
    const eventTarget = target === "window" ? window : document;
    return Effect.acquireRelease(
      Effect.sync(() => eventTarget.addEventListener(type, handler, options)),
      () =>
        Effect.sync(() =>
          eventTarget.removeEventListener(type, handler, options),
        ),
    );
  },
  visibility: () => document.visibilityState,
  focusWindow: () => window.focus(),
});

// Debug logs (sync sessions, notifications) show with devtools or in development.
const LoggingLive = Layer.effect(
  References.MinimumLogLevel,
  Effect.sync(() =>
    getDevtoolsEnabled() || process.env.NODE_ENV === "development"
      ? "Debug"
      : "Info",
  ),
);

export const BackupDatabaseLive = Layer.sync(BackupDatabase, () => indexedDB);

export const BrowserLive = Layer.mergeAll(
  AuthSessionLive,
  BackupDatabaseLive,
  ServerChangesLive,
  TabChannelsLive,
  PageEventsLive,
  FetchHttpClient.layer,
  Digest.layerWebCrypto,
  LoggingLive,
);
