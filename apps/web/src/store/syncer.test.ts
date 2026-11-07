import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asyncDispatch,
  createAction,
  DB,
  defineTable,
  execAsync,
  execSync,
  PreloadedHybridDB,
  SubscribableDB,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { Effect } from "effect";
import {
  changesTable,
  createHlcClock,
  syncStateTable,
  syncStateId,
  type ChangesetArrayType,
  type ClientCursor,
  type SyncSessionResponse,
} from "@will-be-done/slices/common";
import { Syncer } from "./syncer";
import { freezeSyncV4Upload, getPendingSyncV4Upload } from "./syncActions";
import {
  shouldRestartFrozenUpload,
  SyncHttpError,
  SyncNetworkError,
} from "./syncErrors";
import type { SyncConfig } from "./syncTypes";
import { clientSyncV4Tables } from "./syncV4Tables";
import type { SyncStatus } from "./syncStatus";
import { createCrossTabChanges } from "./crossTabChanges";
import { createLocalPersistQueue } from "./localPersistQueue";
import { registerSyncChangeHooks } from "./syncChangeHooks";

const subscription = vi.hoisted(() => ({
  handlers: undefined as
    | { onData: () => void; onError: (error: unknown) => void }
    | undefined,
}));

const statusBus = vi.hoisted(() => ({
  nextIsLeader: true,
  delayChanges: false,
  delayedChanges: [] as (() => void)[],
  channels: [] as {
    name: string;
    onmessage?: (message: unknown) => void;
  }[],
}));

vi.mock("@/lib/trpc.ts", () => ({
  trpcClient: {
    onChangesAvailable: {
      subscribe: vi.fn(
        (
          _input: unknown,
          handlers: { onData: () => void; onError: (error: unknown) => void },
        ) => {
          subscription.handlers = handlers;
          return { unsubscribe: vi.fn() };
        },
      ),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  authUtils: { getToken: () => null },
}));

vi.mock("@/lib/devtools", () => ({
  getDevtoolsEnabled: () => false,
}));

vi.mock("broadcast-channel", () => ({
  BroadcastChannel: class {
    onmessage?: (message: unknown) => void;
    constructor(readonly name: string) {
      statusBus.channels.push(this);
    }
    postMessage(message: unknown) {
      for (const channel of statusBus.channels) {
        if (channel !== this && channel.name === this.name) {
          const deliver = () => channel.onmessage?.(message);
          if (statusBus.delayChanges && this.name.startsWith("changes-")) {
            statusBus.delayedChanges.push(deliver);
          } else {
            deliver();
          }
        }
      }
      return Promise.resolve();
    }
    close() {}
  },
  createLeaderElection: () => ({
    isLeader: statusBus.nextIsLeader,
    awaitLeadership: async () => {},
    onduplicate: undefined,
  }),
}));

type SyncerTestAccess = {
  syncV4: () => Effect.Effect<boolean, unknown>;
};

const config: SyncConfig = {
  dbId: "db-1",
  dbType: "user",
  persistDBTables: [],
  syncableDBTables: [],
  tableNameMap: {},
  afterInit: () => {},
};

const createSyncer = (syncConfig = config) => {
  const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
  execSync(
    db.loadTables([
      ...syncConfig.syncableDBTables,
      changesTable,
      syncStateTable,
      ...clientSyncV4Tables,
    ]),
  );
  const nextClock = createHlcClock("client-1");
  return {
    db,
    syncer: new Syncer(db, "client-1", syncConfig, nextClock),
  };
};

const sessionResponse = (uploadId: string): SyncSessionResponse => ({
  uploadId,
  uploadFromCursor: null,
  downloadFromRevision: 0,
  serverAcknowledgedRevision: 0,
  serverHistoryLost: false,
  serverAhead: false,
  expiresAt: Date.now() + 60_000,
  serverTimeMs: Date.now(),
  limits: {
    maxChunkChanges: 256,
    maxChunkBytes: 1024 * 1024,
    maxFutureSkewMs: 5 * 60 * 1000,
  },
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  subscription.handlers = undefined;
  statusBus.channels = [];
  statusBus.nextIsLeader = true;
  statusBus.delayChanges = false;
  statusBus.delayedChanges = [];
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

describe("sync status", () => {
  const stop = async (syncer: Syncer, run: Promise<void>) => {
    await syncer.stop();
    await run;
  };

  const stubSuccessfulSync = (
    beforeCommit?: (init?: RequestInit) => Promise<void>,
  ) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).endsWith("/sessions")) {
          return jsonResponse(sessionResponse("upload-1"));
        }
        await beforeCommit?.(init);
        return jsonResponse({
          acceptedClientCursor: null,
          serverRevision: 0,
          download: { type: "inline", changesets: [] },
        });
      }),
    );
  };

  it("reports real session stages and marks success only after apply", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const commit = deferred();
    const statuses: SyncStatus[] = [];
    syncer.status.subscribe((status) => statuses.push(status));
    stubSuccessfulSync(() => commit.promise);

    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(syncer.status.get()).toMatchObject({
      phase: "committing",
      lastSyncedAt: null,
    });

    commit.resolve();
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    expect(statuses.map((status) => status.phase)).toEqual([
      "connecting",
      "preparing",
      "uploading",
      "committing",
      "downloading",
      "applying",
      "synced",
    ]);
    expect(syncer.status.get().lastSyncedAt).toBeTypeOf("number");
    await stop(syncer, run);
  });

  it("keeps the last successful time through a connection failure and recovers", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { syncer } = createSyncer();
    stubSuccessfulSync();
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    const lastSyncedAt = syncer.status.get().lastSyncedAt;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    syncer.forceSync();
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("error"));
    expect(syncer.status.get()).toMatchObject({
      lastSyncedAt,
      error: "Could not reach the server. Sync will retry automatically.",
    });

    stubSuccessfulSync();
    syncer.forceSync();
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    expect(syncer.status.get().error).toBeNull();
    await stop(syncer, run);
  });

  it("retries a space the server did not know yet once the user database syncs", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let spaceOnServer = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/space/") && !spaceOnServer) {
          return jsonResponse({ error: "Space not found" }, 404);
        }
        if (url.endsWith("/sessions")) {
          return jsonResponse(sessionResponse("upload-1"));
        }
        if (url.includes("/user/")) spaceOnServer = true;
        return jsonResponse({
          acceptedClientCursor: null,
          serverRevision: 0,
          download: { type: "inline", changesets: [] },
        });
      }),
    );
    const { syncer: spaceSyncer } = createSyncer({
      ...config,
      dbId: "space-1",
      dbType: "space",
    });
    const spaceRun = spaceSyncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() =>
      expect(spaceSyncer.status.get().phase).toBe("error"),
    );

    const { syncer: userSyncer } = createSyncer();
    const userRun = userSyncer.run();
    await vi.advanceTimersByTimeAsync(2_000);

    await vi.waitFor(() =>
      expect(spaceSyncer.status.get().phase).toBe("synced"),
    );
    await stop(userSyncer, userRun);
    await stop(spaceSyncer, spaceRun);
  });

  it("tracks staged download batches and waits for acknowledgement before success", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const firstChunk = deferred();
    const secondChunk = deferred();
    const acknowledgement = deferred();
    const sha256 = async (value: string) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value),
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const checksum = await sha256("[]");
    const manifest = await sha256(`${checksum}\n${checksum}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/sessions"))
          return jsonResponse(sessionResponse("upload-1"));
        if (url.endsWith("/commit"))
          return jsonResponse({
            acceptedClientCursor: null,
            serverRevision: 0,
            download: {
              type: "staged",
              downloadId: "download-1",
              chunkCount: 2,
              checksum: manifest,
            },
          });
        if (url.endsWith("/ack")) {
          await acknowledgement.promise;
          return jsonResponse({});
        }
        await (url.endsWith("/0") ? firstChunk.promise : secondChunk.promise);
        return jsonResponse({ checksum, changesets: [] });
      }),
    );
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() =>
      expect(syncer.status.get()).toMatchObject({
        phase: "downloading",
        progress: { completed: 0, total: 2 },
      }),
    );
    firstChunk.resolve();
    await vi.waitFor(() =>
      expect(syncer.status.get().progress).toEqual({ completed: 1, total: 2 }),
    );
    secondChunk.resolve();
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("applying"));
    expect(syncer.status.get().lastSyncedAt).toBeNull();
    acknowledgement.resolve();
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    await stop(syncer, run);
  });

  it("aborts the in-flight session and keeps update-required status", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const commit = deferred();
    let commitSignal: AbortSignal | null | undefined;
    stubSuccessfulSync((init) => {
      commitSignal = init?.signal;
      return commit.promise;
    });
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(commitSignal).toBeDefined());
    subscription.handlers?.onError({
      data: { syncVersion: { code: "SYNC_VERSION_UNSUPPORTED" } },
    });
    expect(syncer.status.get().phase).toBe("update-required");
    await vi.waitFor(() => expect(commitSignal?.aborted).toBe(true));
    commit.resolve();
    await run;
    expect(syncer.status.get()).toMatchObject({
      phase: "update-required",
      lastSyncedAt: null,
    });
  });

  it("stops the previous loop before a leader handoff starts the next one", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const events: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit) => {
        if (String(input).endsWith("/sessions")) {
          events.push("session");
          return jsonResponse(sessionResponse("upload-1"));
        }
        events.push("commit");
        if (events.length === 2) {
          init.signal?.addEventListener("abort", () =>
            events.push("first commit aborted"),
          );
          return new Promise<Response>(() => {});
        }
        return jsonResponse({
          acceptedClientCursor: null,
          serverRevision: 0,
          download: { type: "inline", changesets: [] },
        });
      }),
    );

    const first = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(events).toEqual(["session", "commit"]));
    const second = syncer.run();
    await first;
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    // The frozen upload is resumed rather than started again.
    expect(events).toEqual([
      "session",
      "commit",
      "first commit aborted",
      "commit",
    ]);
    await stop(syncer, second);
  });

  it("times out and aborts a hung request, then reports a retryable error", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { syncer } = createSyncer();
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init: RequestInit) => {
        signal = init.signal;
        return new Promise<Response>(() => {});
      }),
    );
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(syncer.status.get().phase).toBe("connecting");
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("error"));
    expect(syncer.status.get().error).toBe(
      "Sync could not finish. It will retry automatically.",
    );
    expect(signal?.aborted).toBe(true);
    await stop(syncer, run);
  });

  it("does not report a deferred or discarded transfer as a successful sync", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    vi.spyOn(syncer as unknown as SyncerTestAccess, "syncV4").mockReturnValue(
      Effect.succeed(false),
    );
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(syncer.status.get()).toMatchObject({
      phase: "waiting",
      lastSyncedAt: null,
    });
    await stop(syncer, run);
  });

  it("shares the leader's status with a new tab and wakes the leader for follower writes", async () => {
    vi.useFakeTimers();
    const { syncer: leader } = createSyncer();
    stubSuccessfulSync();
    const run = leader.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(leader.status.get().phase).toBe("synced"));

    statusBus.nextIsLeader = false;
    const { syncer: follower } = createSyncer();
    expect(follower.status.get()).toEqual(leader.status.get());
    const commit = deferred();
    stubSuccessfulSync(() => commit.promise);
    follower.forceSync();
    expect(leader.status.get().phase).toBe("waiting");
    await vi.waitFor(() =>
      expect(follower.status.get().phase).toBe("committing"),
    );
    commit.resolve();
    await vi.waitFor(() => expect(follower.status.get().phase).toBe("synced"));
    expect(follower.status.get()).toEqual(leader.status.get());
    await stop(leader, run);
  });

  it("uploads a follower write after delayed change delivery without waiting for a poll", async () => {
    vi.useFakeTimers();
    const items = defineTable("delayed_follower_items", {
      id: v.string(),
      title: v.string(),
    });
    const tables = [items, changesTable, syncStateTable, ...clientSyncV4Tables];
    const driver = new BptreeInmemDriver();
    const primary = new DB(driver);
    const followerDB = new SubscribableDB(new DB(driver));
    await execAsync(primary.loadTables(tables));
    await execAsync(followerDB.loadTables(tables));
    const leaderDB = new SubscribableDB(new PreloadedHybridDB(primary));
    await execAsync(leaderDB.loadTables(tables));
    const syncConfig = {
      ...config,
      persistDBTables: tables,
      syncableDBTables: [items],
      tableNameMap: { [items.tableName]: items },
    };
    const leaderClock = createHlcClock("client-1/leader");
    const leader = new Syncer(leaderDB, "client-1", syncConfig, leaderClock);
    registerSyncChangeHooks({
      syncSubDb: leaderDB,
      syncableDBTables: [items],
      clientId: "client-1",
      nextClock: leaderClock,
    });
    createCrossTabChanges({
      clientId: "client-1",
      syncSubDb: leaderDB,
      syncConfig,
      nextClock: leaderClock,
      onApplied: () => leader.forceSync(),
    });

    let sessions = 0;
    let acceptedCursor: ClientCursor | null = null;
    const uploaded: ChangesetArrayType = [];
    const committed: ChangesetArrayType = [];
    const commitGate = deferred();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/sessions")) {
          sessions += 1;
          return jsonResponse({
            ...sessionResponse(`upload-${sessions}`),
            uploadFromCursor: acceptedCursor,
          });
        }
        if (url.includes("/chunks/")) {
          const { payload } = JSON.parse(String(init.body));
          uploaded.push(...(JSON.parse(payload) as ChangesetArrayType));
          return jsonResponse({});
        }
        if (url.endsWith("/commit")) {
          const { changeCount, throughCursor } = JSON.parse(String(init.body));
          if (changeCount > 0) {
            await commitGate.promise;
            committed.push(...uploaded);
          }
          acceptedCursor = throughCursor;
          return jsonResponse({
            acceptedClientCursor: acceptedCursor,
            serverRevision: 0,
            download: { type: "inline", changesets: [] },
          });
        }
        throw new Error(`Unexpected sync request: ${url}`);
      }),
    );

    const run = leader.run();
    try {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.waitFor(() => expect(leader.status.get().phase).toBe("synced"));
      statusBus.nextIsLeader = false;
      const followerClock = createHlcClock("client-1/follower");
      const follower = new Syncer(
        followerDB,
        "client-1",
        syncConfig,
        followerClock,
      );
      registerSyncChangeHooks({
        syncSubDb: followerDB,
        syncableDBTables: [items],
        clientId: "client-1",
        nextClock: followerClock,
      });
      const followerChanges = createCrossTabChanges({
        clientId: "client-1",
        syncSubDb: followerDB,
        syncConfig,
        nextClock: followerClock,
        onApplied: () => follower.forceSync(),
      });
      createLocalPersistQueue({
        syncSubDb: followerDB,
        postChanges: followerChanges.postChanges,
        onPersisted: () => follower.forceSync(),
      }).start();

      statusBus.delayChanges = true;
      const row = { id: "follower-write", title: "Must reach the server" };
      await asyncDispatch(
        followerDB,
        createAction()({
          name: "writeFromFollower",
          args: {},
          handler: function* () {
            yield* upsert(items, [row]);
          },
        })({}),
      );
      await vi.waitFor(() => expect(sessions).toBe(2));
      await vi.waitFor(() => expect(leader.status.get().phase).toBe("synced"));
      expect(follower.status.get().phase).toBe("synced");
      expect(uploaded).toEqual([]);
      expect(statusBus.delayedChanges).toHaveLength(1);

      // The status-channel wake-up has already finished an empty session.
      // Only delivery and completion of the changes-channel merge can wake it now.
      statusBus.delayChanges = false;
      statusBus.delayedChanges.splice(0).forEach((deliver) => deliver());
      await vi.waitFor(() => expect(uploaded).toHaveLength(1));
      expect(uploaded[0].data).toEqual([expect.objectContaining({ row })]);
      expect(committed).toEqual([]);
      expect(leader.status.get().phase).not.toBe("synced");
      expect(follower.status.get().phase).not.toBe("synced");
      commitGate.resolve();
      await vi.waitFor(() =>
        expect(follower.status.get().phase).toBe("synced"),
      );
      expect(committed).toEqual(uploaded);
      expect(sessions).toBe(3);
    } finally {
      commitGate.resolve();
      await stop(leader, run);
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sync v4 request recovery", () => {
  it("waits for durable download apply before acknowledging the server", async () => {
    const { db, syncer } = createSyncer();
    const blocked = deferred();
    const durable = deferred();
    const acknowledged = deferred();
    vi.spyOn(db, "waitForPersistence").mockImplementation(function* () {
      const state = execSync(
        db.intervalScan(syncStateTable, "byId", [
          { eq: [{ col: "id", val: syncStateId }] },
        ]),
      )[0];
      if (state?.lastServerAppliedRevision === 7) {
        blocked.resolve();
        yield { type: "unwrap", data: durable.promise };
      }
    });
    const ack = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/sessions"))
          return jsonResponse(sessionResponse("durability-upload"));
        if (url.endsWith("/commit"))
          return jsonResponse({
            acceptedClientCursor: null,
            serverRevision: 7,
            download: {
              type: "staged",
              downloadId: "durability-download",
              chunkCount: 0,
              checksum:
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            },
          });
        if (url.endsWith("/ack")) {
          ack();
          acknowledged.resolve();
          return jsonResponse({});
        }
        throw new Error(`Unexpected sync request: ${url}`);
      }),
    );
    const running = Effect.runPromise(
      (syncer as unknown as SyncerTestAccess).syncV4(),
    );
    try {
      expect(
        await Promise.race([
          blocked.promise.then(() => "blocked"),
          acknowledged.promise.then(() => "acknowledged"),
          running.then(() => "finished"),
        ]),
      ).toBe("blocked");
      expect(ack).not.toHaveBeenCalled();
    } finally {
      durable.resolve();
      await running;
    }
    expect(ack).toHaveBeenCalledOnce();
  });

  it("wakes a fresh session when a resumed upload predates local changes", async () => {
    const items = defineTable("resumed_items", {
      id: v.string(),
      title: v.string(),
    });
    const syncConfig = {
      ...config,
      syncableDBTables: [items],
      tableNameMap: { [items.tableName]: items },
    };
    const { db, syncer } = createSyncer(syncConfig);
    const access = syncer as unknown as SyncerTestAccess;
    registerSyncChangeHooks({
      syncSubDb: db,
      syncableDBTables: [items],
      clientId: "client-1",
      nextClock: createHlcClock("client-1"),
    });
    await asyncDispatch(
      db,
      freezeSyncV4Upload({
        uploadId: "resumed-upload",
        after: null,
        registeredSyncableTableNameMap: syncConfig.tableNameMap,
        now: Date.now(),
      }),
    );
    const row = { id: "local-edit", title: "Edited before sync resumed" };
    await asyncDispatch(
      db,
      createAction()({
        name: "editBeforeResume",
        args: {},
        handler: function* () {
          yield* upsert(items, [row]);
        },
      })({}),
    );

    const uploaded: ChangesetArrayType = [];
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init: RequestInit) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/sessions")) {
          return jsonResponse(sessionResponse("fresh-upload"));
        }
        if (url.includes("/chunks/")) {
          const { payload } = JSON.parse(String(init.body));
          uploaded.push(...(JSON.parse(payload) as ChangesetArrayType));
          return jsonResponse({});
        }
        if (url.endsWith("/commit")) {
          const { throughCursor } = JSON.parse(String(init.body));
          return jsonResponse({
            acceptedClientCursor: throughCursor,
            serverRevision: 0,
            download: { type: "inline", changesets: [] },
          });
        }
        throw new Error(`Unexpected sync request: ${url}`);
      }),
    );
    const wake = vi.spyOn(syncer, "forceSync");

    expect(await Effect.runPromise(access.syncV4())).toBe(false);
    expect(wake).toHaveBeenCalledOnce();
    expect(await asyncDispatch(db, getPendingSyncV4Upload({}))).toBeUndefined();

    expect(await Effect.runPromise(access.syncV4())).toBe(true);
    expect(requests.filter((url) => url.endsWith("/sessions"))).toHaveLength(1);
    expect(uploaded).toEqual([
      { tableName: items.tableName, data: [expect.objectContaining({ row })] },
    ]);
  });

  it("restarts only a resumed upload that received an actual 404", () => {
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncHttpError({ status: 404, body: '{"error":"expired"}' }),
      ),
    ).toBe(true);
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncNetworkError({
          cause: new Error("upstream text happened to contain (404)"),
        }),
      ),
    ).toBe(false);
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncHttpError({ status: 409, body: '{"error":"conflict"}' }),
      ),
    ).toBe(false);
    expect(
      shouldRestartFrozenUpload(
        false,
        new SyncHttpError({ status: 404, body: '{"error":"expired"}' }),
      ),
    ).toBe(false);
  });

  it("restarts for only the dedicated cursor advancement conflict", () => {
    expect(
      shouldRestartFrozenUpload(
        false,
        new SyncHttpError({
          status: 409,
          body: '{"error":"advanced","code":"SYNC_CLIENT_CURSOR_ADVANCED"}',
        }),
      ),
    ).toBe(true);
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncHttpError({
          status: 409,
          body: '{"error":"checksum conflict"}',
        }),
      ),
    ).toBe(false);
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncHttpError({ status: 409, body: "not json" }),
      ),
    ).toBe(false);
  });

  it("discards a cursor-advanced upload and succeeds after a fresh handshake", async () => {
    vi.useFakeTimers();
    const { db, syncer } = createSyncer();
    const requests: string[] = [];
    let handshakes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/sessions")) {
          handshakes += 1;
          return jsonResponse(sessionResponse(`upload-${handshakes}`));
        }
        if (url.endsWith("/upload-1/commit")) {
          return jsonResponse(
            {
              error: "Client cursor advanced in another sync session",
              code: "SYNC_CLIENT_CURSOR_ADVANCED",
            },
            409,
          );
        }
        if (url.endsWith("/upload-2/commit")) {
          return jsonResponse({
            acceptedClientCursor: null,
            serverRevision: 0,
            download: { type: "inline", changesets: [] },
          });
        }
        throw new Error(`Unexpected sync request: ${url}`);
      }),
    );

    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(syncer.status.get().phase).toBe("synced"));
    await syncer.stop();
    await run;

    expect(handshakes).toBe(2);
    expect(requests.filter((url) => url.endsWith("/sessions"))).toHaveLength(2);
    expect(await asyncDispatch(db, getPendingSyncV4Upload({}))).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("syncer notification baseline", () => {
  const verifyPendingNotificationStartsNextSession = async (
    notify: (syncer: Syncer) => void,
  ) => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const access = syncer as unknown as SyncerTestAccess;
    const firstSession = deferred();
    const phases: string[] = [];
    syncer.status.subscribe((status) => phases.push(status.phase));
    let sessions = 0;
    vi.spyOn(access, "syncV4").mockImplementation(() => {
      sessions += 1;
      if (sessions === 1) {
        return Effect.promise(() => firstSession.promise).pipe(Effect.as(true));
      }
      void syncer.stop();
      return Effect.never;
    });

    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sessions).toBe(1);

    notify(syncer);
    firstSession.resolve();
    await vi.waitFor(() => expect(sessions).toBe(2));
    expect(phases).not.toContain("synced");

    // No poll interval was advanced: the notification that arrived before the
    // wait subscriptions were installed started this session immediately.
    expect(vi.getTimerCount()).toBe(0);
    await run;
  };

  it("preserves a WebSocket notification emitted while sync is pending", async () => {
    await verifyPendingNotificationStartsNextSession(() => {
      subscription.handlers?.onData();
    });
  });

  it("preserves a local notification emitted while sync is pending", async () => {
    await verifyPendingNotificationStartsNextSession((syncer) => {
      syncer.forceSync();
    });
  });
});
