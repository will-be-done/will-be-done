import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asyncDispatch,
  DB,
  execSync,
  SubscribableDB,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changesTable,
  createHlcClock,
  syncStateTable,
  type SyncSessionResponse,
} from "@will-be-done/slices/common";
import { Syncer } from "./syncer";
import { getPendingSyncV4Upload } from "./syncActions";
import {
  shouldRestartExpiredUpload,
  shouldRestartFrozenUpload,
  SyncRequestError,
} from "./syncRequestError";
import type { SyncConfig } from "./syncTypes";
import { clientSyncV4Tables } from "./syncV4Tables";
import type { SyncStatus } from "./syncStatus";

const subscription = vi.hoisted(() => ({
  handlers: undefined as
    | { onData: () => void; onError: (error: unknown) => void }
    | undefined,
}));

const statusBus = vi.hoisted(() => ({
  nextIsLeader: true,
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
          channel.onmessage?.(message);
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
  runId: number;
  syncV4: () => Promise<boolean>;
};

const config: SyncConfig = {
  dbId: "db-1",
  dbType: "user",
  persistDBTables: [],
  syncableDBTables: [],
  tableNameMap: {},
  afterInit: () => {},
};

const createSyncer = () => {
  const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
  execSync(
    db.loadTables([changesTable, syncStateTable, ...clientSyncV4Tables]),
  );
  const nextClock = createHlcClock("client-1");
  return {
    db,
    syncer: new Syncer(db, "client-1", config, nextClock),
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
    (syncer as unknown as SyncerTestAccess).runId += 1;
    syncer.forceSync();
    await run;
  };

  const stubSuccessfulSync = (beforeCommit?: () => Promise<void>) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith("/sessions")) {
          return jsonResponse(sessionResponse("upload-1"));
        }
        await beforeCommit?.();
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

  it("keeps update-required status when an in-flight session finishes", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    const commit = deferred();
    stubSuccessfulSync(() => commit.promise);
    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    subscription.handlers?.onError({
      data: { syncVersion: { code: "SYNC_VERSION_UNSUPPORTED" } },
    });
    expect(syncer.status.get().phase).toBe("update-required");
    commit.resolve();
    await run;
    expect(syncer.status.get()).toMatchObject({
      phase: "update-required",
      lastSyncedAt: null,
    });
  });

  it("does not report a deferred or discarded transfer as a successful sync", async () => {
    vi.useFakeTimers();
    const { syncer } = createSyncer();
    vi.spyOn(
      syncer as unknown as { syncV4: () => Promise<boolean> },
      "syncV4",
    ).mockResolvedValue(false);
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sync v4 request recovery", () => {
  it("restarts only a resumed upload that received an actual 404", () => {
    expect(
      shouldRestartExpiredUpload(
        true,
        new SyncRequestError(404, '{"error":"expired"}'),
      ),
    ).toBe(true);
    expect(
      shouldRestartExpiredUpload(
        true,
        new Error("upstream text happened to contain (404)"),
      ),
    ).toBe(false);
    expect(
      shouldRestartExpiredUpload(
        true,
        new SyncRequestError(409, '{"error":"conflict"}'),
      ),
    ).toBe(false);
    expect(
      shouldRestartExpiredUpload(
        false,
        new SyncRequestError(404, '{"error":"expired"}'),
      ),
    ).toBe(false);
  });

  it("restarts for only the dedicated cursor advancement conflict", () => {
    expect(
      shouldRestartFrozenUpload(
        false,
        new SyncRequestError(
          409,
          '{"error":"advanced","code":"SYNC_CLIENT_CURSOR_ADVANCED"}',
        ),
      ),
    ).toBe(true);
    expect(
      shouldRestartFrozenUpload(
        true,
        new SyncRequestError(409, '{"error":"checksum conflict"}'),
      ),
    ).toBe(false);
    expect(
      shouldRestartFrozenUpload(true, new SyncRequestError(409, "not json")),
    ).toBe(false);
  });

  it("discards a cursor-advanced upload and succeeds after a fresh handshake", async () => {
    vi.useFakeTimers();
    const { db, syncer } = createSyncer();
    const access = syncer as unknown as SyncerTestAccess;
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
          syncer.forceSync();
          access.runId += 1;
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
    vi.spyOn(access, "syncV4").mockImplementation(async () => {
      sessions += 1;
      if (sessions === 1) {
        await firstSession.promise;
        return true;
      }
      syncer.forceSync();
      access.runId += 1;
      return true;
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
