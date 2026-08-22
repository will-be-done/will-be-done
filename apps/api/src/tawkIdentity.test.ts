import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { DB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { TRPCError } from "@trpc/server";
import { createAppRouter } from "./appRouter";

const user = { id: "user-123", email: "person@example.com" };

describe("Tawk identity", () => {
  test("signs the authenticated user ID with HMAC-SHA256", async () => {
    const apiKey = "tawk-test-api-key";
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
      tawkApiKey: apiKey,
    }).createCaller({ user });

    expect(await caller.getTawkIdentity()).toEqual({
      userId: user.id,
      email: user.email,
      hash: createHmac("sha256", apiKey).update(user.id).digest("hex"),
    });
  });

  test("keeps authenticated users anonymous without an API key", async () => {
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
    }).createCaller({ user });

    expect(await caller.getTawkIdentity()).toBeNull();
  });

  test("rejects anonymous callers", async () => {
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
      tawkApiKey: "tawk-test-api-key",
    }).createCaller({ user: null });

    try {
      await caller.getTawkIdentity();
      throw new Error("Expected anonymous identity lookup to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});
