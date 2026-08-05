import { describe, expect, spyOn, test } from "bun:test";
import { DB, execSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { TRPCError } from "@trpc/server";
import { createAppRouter } from "./appRouter";
import * as databases from "./db/db";
import { createServer } from "./server";
import { authenticateBearerToken } from "./services/authentication";
import {
  getTokenById,
  register,
  tokensTable,
  usersTable,
} from "./slices/authSlice";

function setUp() {
  const mainDB = new DB(new BptreeInmemDriver());
  execSync(mainDB.loadTables([usersTable, tokensTable]));

  const first = syncDispatch(
    mainDB,
    register({ email: "first@example.com", hashedPassword: "hashed" }),
  );
  const second = syncDispatch(
    mainDB,
    register({ email: "second@example.com", hashedPassword: "hashed" }),
  );
  const appRouter = createAppRouter({ mainDB, captchaConfig: null });

  return {
    first,
    firstCaller: appRouter.createCaller({
      user: { id: first.userId, email: "first@example.com" },
    }),
    secondCaller: appRouter.createCaller({
      user: { id: second.userId, email: "second@example.com" },
    }),
  };
}

describe("token management", () => {
  test("lists, creates, and deletes the authenticated user's tokens", async () => {
    const { first, firstCaller } = setUp();

    expect(await firstCaller.listTokens()).toEqual([
      expect.objectContaining({ id: first.token }),
    ]);

    const created = await firstCaller.createToken();
    expect(created).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
    });
    expect((await firstCaller.listTokens()).map((token) => token.id)).toEqual(
      expect.arrayContaining([first.token, created.id]),
    );

    expect(await firstCaller.deleteToken({ tokenId: created.id })).toEqual({
      success: true,
    });
    expect(await firstCaller.listTokens()).toEqual([
      expect.objectContaining({ id: first.token }),
    ]);
  });

  test("does not allow deleting another user's token", async () => {
    const { first, firstCaller, secondCaller } = setUp();

    try {
      await secondCaller.deleteToken({ tokenId: first.token });
      throw new Error("Expected deletion to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({ code: "NOT_FOUND" });
    }

    expect(await firstCaller.listTokens()).toEqual([
      expect.objectContaining({ id: first.token }),
    ]);
  });

  test("records and lists usage metadata when a token authenticates", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([usersTable, tokensTable]));
    const registered = syncDispatch(
      mainDB,
      register({ email: "usage@example.com", hashedPassword: "hashed" }),
    );

    expect(
      authenticateBearerToken(`Bearer ${registered.token}`, mainDB, {
        usedAt: "2026-07-26T12:00:00.000Z",
        ip: "203.0.113.10",
        userAgent: "WillBeDoneTest/1.0",
      }),
    ).toMatchObject({ id: registered.userId });
    expect(
      syncDispatch(mainDB, getTokenById({ id: registered.token })),
    ).toMatchObject({
      lastUsedAt: "2026-07-26T12:00:00.000Z",
      lastUsedIp: "203.0.113.10",
      lastUsedUserAgent: "WillBeDoneTest/1.0",
    });

    const caller = createAppRouter({
      mainDB,
      captchaConfig: null,
    }).createCaller({
      user: { id: registered.userId, email: "usage@example.com" },
    });
    expect(await caller.listTokens()).toEqual([
      expect.objectContaining({
        id: registered.token,
        lastUsedAt: "2026-07-26T12:00:00.000Z",
        lastUsedIp: "203.0.113.10",
        lastUsedUserAgent: "WillBeDoneTest/1.0",
      }),
    ]);
  });

  test("records the client IP only through a trusted reverse proxy", async () => {
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([usersTable, tokensTable]));
    const registered = syncDispatch(
      mainDB,
      register({ email: "proxy@example.com", hashedPassword: "hashed" }),
    );
    const getMainDbSpy = spyOn(databases, "getMainHyperDB").mockImplementation(
      () => mainDB,
    );
    const server = createServer({
      appRouter: createAppRouter({ mainDB, captchaConfig: null }),
      logger: false,
      serveFrontend: false,
    });

    try {
      await server.ready();
      const trustedProxyResponse = await server.inject({
        method: "GET",
        url: "/api/trpc/listTokens",
        remoteAddress: "10.0.0.9",
        headers: {
          authorization: `Bearer ${registered.token}`,
          "x-forwarded-for": "203.0.113.77",
        },
      });
      expect(trustedProxyResponse.statusCode).toBe(200);
      expect(
        syncDispatch(mainDB, getTokenById({ id: registered.token })),
      ).toMatchObject({ lastUsedIp: "203.0.113.77" });

      const untrustedPeerResponse = await server.inject({
        method: "GET",
        url: "/api/trpc/listTokens",
        remoteAddress: "198.51.100.8",
        headers: {
          authorization: `Bearer ${registered.token}`,
          "x-forwarded-for": "192.0.2.25",
        },
      });
      expect(untrustedPeerResponse.statusCode).toBe(200);
      expect(
        syncDispatch(mainDB, getTokenById({ id: registered.token })),
      ).toMatchObject({ lastUsedIp: "198.51.100.8" });
    } finally {
      await server.close();
      getMainDbSpy.mockRestore();
    }
  });
});
