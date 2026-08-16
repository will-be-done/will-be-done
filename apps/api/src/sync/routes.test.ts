import { createHash } from "node:crypto";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  createAction,
  DB,
  execSync,
  selectFrom,
  syncDispatch,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  formatHlc,
  SYNC_V4_MAX_FUTURE_SKEW_MS,
  SYNC_V4_SESSION_TTL_MS,
} from "@will-be-done/slices/common";
import { createAppRouter } from "../appRouter";
import { userDBConfig } from "../db/configs";
import * as databases from "../db/db";
import { createServer } from "../server";
import { register, tokensTable, usersTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import { syncUploadSessionsTable } from "./tables";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const testAction = createAction();
const overwriteSessionMaxObservedClock = testAction({
  name: "overwriteSessionMaxObservedClock",
  args: { uploadId: v.string(), clock: v.string() },
  handler: function* ({ uploadId, clock }) {
    const session = yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first();
    if (!session) throw new Error("Missing upload session");
    yield* upsert(syncUploadSessionsTable, [
      { ...session, maxObservedClock: clock },
    ]);
  },
});

describe("sync v4 routes", () => {
  afterEach(() => {
    mock.restore();
  });

  test("checksums the exact frozen upload payload before parsing it", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([usersTable, tokensTable, dbsTable]));
    const auth = syncDispatch(
      mainDB,
      register({ email: "user@example.com", hashedPassword: "hash" }),
    );
    const config = userDBConfig(auth.userId);
    const userDB = new DB(new BptreeInmemDriver());
    execSync(userDB.loadTables(config.persistDBTables));

    spyOn(databases, "getHyperDB").mockResolvedValue({
      db: userDB,
      dbConfig: config,
      nextClock: Object.assign(() => "", { observe: () => {} }),
      clientId: "server",
    } as never);

    const server = createServer({
      appRouter: createAppRouter({ mainDB, captchaConfig: null }),
      logger: false,
      serveFrontend: false,
      mainDB,
    });

    try {
      const sessionResponse = await server.inject({
        method: "POST",
        url: `/api/sync/v4/user/${auth.userId}/sessions`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          syncVersion: 4,
          dbId: auth.userId,
          dbType: "user",
          clientId: "client",
          expectedAcceptedClientCursor: null,
          coveredClientCursor: null,
          expectedAcknowledgedServerRevision: 0,
          appliedServerRevision: 0,
        },
      });
      expect(sessionResponse.statusCode).toBe(200);
      const session = sessionResponse.json() as {
        uploadId: string;
        serverTimeMs: number;
        limits: { maxFutureSkewMs: number };
      };
      const { uploadId } = session;
      expect(session.serverTimeMs).toBeGreaterThan(0);
      expect(session.limits.maxFutureSkewMs).toBe(SYNC_V4_MAX_FUTURE_SKEW_MS);
      const clock = formatHlc({
        physical: 1_700_000_000_000,
        logical: 0,
        actorId: "client",
      });
      const row = {
        id: "space-1",
        type: "space",
        name: "Space",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      const change = {
        id: "spaces:space-1",
        entityId: "space-1",
        tableName: "spaces",
        createdAt: clock,
        updatedAt: clock,
        deletedAt: null,
        clientId: "client",
        changes: Object.fromEntries(
          Object.keys(row).map((key) => [key, clock]),
        ),
      };
      const payload = JSON.stringify([
        { tableName: "spaces", data: [{ change, row }] },
      ]);

      const chunkResponse = await server.inject({
        method: "PUT",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/chunks/0`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { checksum: sha256(payload), payload },
      });

      expect(chunkResponse.statusCode).toBe(200);
      expect(
        chunkResponse.json() as { changeCount: number; replay: boolean },
      ).toEqual({ changeCount: 1, replay: false });

      const retryResponse = await server.inject({
        method: "PUT",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/chunks/0`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { checksum: sha256(payload), payload },
      });
      expect(retryResponse.statusCode).toBe(200);
      expect(
        retryResponse.json() as { changeCount: number; replay: boolean },
      ).toEqual({ changeCount: 1, replay: true });

      const futureClock = formatHlc({
        physical: Date.now() + 2 * 60 * 60 * 1000,
        logical: 0,
        actorId: "future-client",
      });
      const futurePayload = JSON.stringify([
        {
          tableName: "spaces",
          data: [
            {
              row,
              change: {
                ...change,
                createdAt: futureClock,
                updatedAt: futureClock,
                clientId: "future-client",
                changes: Object.fromEntries(
                  Object.keys(row).map((key) => [key, futureClock]),
                ),
              },
            },
          ],
        },
      ]);
      const futureResponse = await server.inject({
        method: "PUT",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/chunks/1`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          checksum: sha256(futurePayload),
          payload: futurePayload,
        },
      });
      expect(futureResponse.statusCode).toBe(422);
      expect(futureResponse.json()).toMatchObject({
        code: "SYNC_CLOCK_SKEW",
        observedClock: futureClock,
        maxFutureSkewMs: SYNC_V4_MAX_FUTURE_SKEW_MS,
      });

      const behindClock = formatHlc({
        physical: Date.now() - 2 * 60 * 60 * 1000,
        logical: 0,
        actorId: "behind-client",
      });
      const behindPayload = JSON.stringify([
        {
          tableName: "spaces",
          data: [
            {
              row,
              change: {
                ...change,
                createdAt: behindClock,
                updatedAt: behindClock,
                clientId: "behind-client",
                changes: Object.fromEntries(
                  Object.keys(row).map((key) => [key, behindClock]),
                ),
              },
            },
          ],
        },
      ]);
      const behindResponse = await server.inject({
        method: "PUT",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/chunks/1`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          checksum: sha256(behindPayload),
          payload: behindPayload,
        },
      });
      expect(behindResponse.statusCode).toBe(200);

      // Simulate a future-clock chunk staged before skew validation was
      // deployed. Commit must validate before observing the session clock.
      syncDispatch(
        userDB,
        overwriteSessionMaxObservedClock({ uploadId, clock: futureClock }),
      );
      const commitResponse = await server.inject({
        method: "POST",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/commit`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: {
          chunkCount: 2,
          changeCount: 2,
          throughCursor: {
            clock: behindClock,
            changeId: change.id,
          },
          checksum: sha256([sha256(payload), sha256(behindPayload)].join("\n")),
        },
      });
      expect(commitResponse.statusCode).toBe(422);
      expect(commitResponse.json()).toMatchObject({
        code: "SYNC_CLOCK_SKEW",
        observedClock: futureClock,
      });

      const now = Date.now();
      spyOn(Date, "now").mockReturnValue(now + SYNC_V4_SESSION_TTL_MS + 1);
      const expiredResponse = await server.inject({
        method: "PUT",
        url: `/api/sync/v4/user/${auth.userId}/sessions/${uploadId}/chunks/1`,
        headers: { authorization: `Bearer ${auth.token}` },
        payload: { checksum: sha256(payload), payload },
      });
      expect(expiredResponse.statusCode).toBe(404);
      expect(expiredResponse.json() as { error: string }).toEqual({
        error: "Sync upload session is not active",
      });
    } finally {
      await server.close();
    }
  });
});
