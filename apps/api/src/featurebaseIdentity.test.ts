import { describe, expect, test } from "bun:test";
import { DB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { createAppRouter } from "./appRouter";

const user = { id: "user-123", email: "person@example.com" };

describe("Featurebase identity", () => {
  test("signs the authenticated user with HS256", async () => {
    const secret = "featurebase-test-secret";
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
      featurebaseJwtSecret: secret,
    }).createCaller({ user });

    const { featurebaseJwt } = await caller.getFeaturebaseIdentity();

    expect(featurebaseJwt).not.toBeNull();
    expect(
      jwt.verify(featurebaseJwt!, secret, { algorithms: ["HS256"] }),
    ).toMatchObject({
      userId: user.id,
      email: user.email,
    });
  });

  test("keeps authenticated users anonymous when no secret is configured", async () => {
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
    }).createCaller({ user });

    expect(await caller.getFeaturebaseIdentity()).toEqual({
      featurebaseJwt: null,
    });
  });

  test("rejects anonymous callers", async () => {
    const caller = createAppRouter({
      mainDB: new DB(new BptreeInmemDriver()),
      captchaConfig: null,
      featurebaseJwtSecret: "featurebase-test-secret",
    }).createCaller({ user: null });

    try {
      await caller.getFeaturebaseIdentity();
      throw new Error("Expected anonymous identity lookup to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error).toMatchObject({ code: "UNAUTHORIZED" });
    }
  });
});
