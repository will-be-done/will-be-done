import { createHash } from "node:crypto";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { DB, execSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { formatHlc, SYNC_V4_SESSION_TTL_MS } from "@will-be-done/slices/common";
import { createAppRouter } from "../appRouter";
import { userDBConfig } from "../db/configs";
import * as databases from "../db/db";
import { createServer } from "../server";
import { register, tokensTable, usersTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

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
      const { uploadId } = sessionResponse.json() as { uploadId: string };
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
