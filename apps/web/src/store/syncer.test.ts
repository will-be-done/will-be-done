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

const subscription = vi.hoisted(() => ({
  handlers: undefined as
    | { onData: () => void; onError: (error: unknown) => void }
    | undefined,
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
    close() {}
  },
  createLeaderElection: () => ({
    awaitLeadership: async () => {},
    onduplicate: undefined,
  }),
}));

type SyncerTestAccess = {
  runId: number;
  syncV4: () => Promise<void>;
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
    let sessions = 0;
    vi.spyOn(access, "syncV4").mockImplementation(async () => {
      sessions += 1;
      if (sessions === 1) {
        await firstSession.promise;
        return;
      }
      syncer.forceSync();
      access.runId += 1;
    });

    const run = syncer.run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(sessions).toBe(1);

    notify(syncer);
    firstSession.resolve();
    await vi.waitFor(() => expect(sessions).toBe(2));

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
