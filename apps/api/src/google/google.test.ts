import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DB,
  defineTable,
  insert,
  type TableDefinition,
  asyncDispatch,
  execAsync,
  selectAsync,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { AsyncSqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createAppRouter, type AppRouter } from "../appRouter";
import { createServer } from "../server";
import { usersTable, tokensTable } from "../slices/tables";
import {
  backfillUserEmails,
  getUserById,
  register,
  revokeToken,
} from "../slices/authSlice";
import { authenticateBearerToken } from "../services/authentication";
import { action } from "../builders";
import { accountEmailTables, emailChallengesTable } from "../email/tables";
import { createAccountEmailService } from "../email/service";
import { googleFlowsTable, type GoogleProfile } from "./tables";
import { createGoogleService, type GoogleService } from "./service";
import { hashSecret } from "./actions";
import { parseGoogleConfig } from "./config";

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function rejects(promise: Promise<unknown>, message?: string) {
  let error: unknown;
  try {
    await promise;
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(Error);
  if (message) expect((error as Error).message).toContain(message);
}
const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  appUrl: "http://127.0.0.1:5174",
};
const emailConfig = {
  apiKey: "test-only",
  from: "accounts@example.com",
  appUrl: config.appUrl,
};
const password = "test-password-123";
const changeUser = action({
  name: "changeUserForGoogleTest",
  args: { id: v.string(), verified: v.boolean() },
  handler: function* ({ id, verified }) {
    const user = (yield* getUserById({ id }))!;
    yield* upsert(usersTable, [
      {
        ...user,
        ...(verified ? { emailVerifiedAt: new Date().toISOString() } : {}),
      },
    ]);
  },
});

async function fixture(
  path = ":memory:",
  userTable: TableDefinition = usersTable,
) {
  const sql = new Database(path);
  const db = new DB(
    new AsyncSqlDriver({
      async exec(query, params) {
        sql.run(query, params ?? []);
      },
      prepare(query) {
        const statement = sql.prepare(query);
        return {
          values: async (params) =>
            statement.values(...params) as (
              | string
              | number
              | Uint8Array
              | null
            )[][],
          finalize: () => statement.finalize(),
        };
      },
    }),
  );
  await execAsync(
    db.loadTables([
      userTable,
      tokensTable,
      googleFlowsTable,
      ...accountEmailTables,
    ]),
  );
  cleanup.push(() => sql.close());
  let time = Date.now();
  let profile: GoogleProfile = {
    subject: "google-user-1",
    email: "person@gmail.com",
    emailAuthoritative: true,
  };
  const options = {
    now: () => time,
    emailConfig,
    provider: {
      authorizationUrl: (flow: { id: string }) =>
        `https://accounts.google.test/authorize?state=${flow.id}`,
      async verify(code: string) {
        if (code !== "valid") throw new Error("Invalid token");
        return profile;
      },
    },
  };
  const google = createGoogleService(db, config, options);
  const router = createAppRouter({
    mainDB: db,
    captchaConfig: null,
    google,
    accountEmail: createAccountEmailService(db, emailConfig),
  });
  const publicCaller = router.createCaller({ user: null });
  const user = async (id: string) =>
    selectAsync(db, { selector: getUserById, args: { id } });
  async function passwordAccount(email = "app@example.com", verified = true) {
    const account = await asyncDispatch(
      db,
      register({ email, hashedPassword: await Bun.password.hash(password) }),
    );
    await asyncDispatch(db, changeUser({ id: account.userId, verified }));
    return {
      ...account,
      caller: router.createCaller({
        user: { id: account.userId, email },
        tokenId: account.token,
      }),
    };
  }
  async function ready(
    session?: { userId: string; tokenId: string },
    service: GoogleService = google,
  ) {
    const flow = await service.begin(session, { desktop: true });
    const url = new URL(flow.launchUrl);
    await service.launch(
      flow.id,
      url.searchParams.get("launch")!,
      "browser-cookie",
      { confirmationCode: flow.confirmationCode! },
    );
    await service.callback(flow.id, "browser-cookie", "valid");
    return flow;
  }
  return {
    db,
    google,
    router,
    publicCaller,
    user,
    passwordAccount,
    ready,
    options,
    setProfile: (next: GoogleProfile) => {
      profile = next;
    },
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
}

describe("Google accounts", () => {
  test("signup is passwordless; stable subject wins over changed email and cannot be replayed", async () => {
    const f = await fixture();
    const flow = await f.ready();
    const result = await f.publicCaller.google.completeSignIn(flow);
    const user = (await f.user(result.userId))!;
    expect(user.password).toBeUndefined();
    expect(user.emailVerifiedAt).toBeString();
    expect(user.email).toBe("person@gmail.com");
    expect(
      await authenticateBearerToken(`Bearer ${result.token}`, f.db),
    ).toMatchObject({ id: user.id });
    await rejects(f.google.completeSignIn(flow));
    await rejects(
      f.publicCaller.login({ email: user.email, password }),
      "Invalid credentials",
    );
    f.setProfile({
      subject: user.googleSubject!,
      email: "changed@gmail.com",
      emailAuthoritative: true,
    });
    const again = await f.google.completeSignIn(await f.ready());
    expect(again.userId).toBe(user.id);
    expect((await f.user(user.id))!.email).toBe(user.email);
    expect((await f.user(user.id))!.googleEmail).toBe("changed@gmail.com");
  });

  test("same email rejects Google signin, including case differences, without issuing a token", async () => {
    const f = await fixture();
    const account = await f.passwordAccount("Person@Gmail.com");
    const flow = await f.ready();
    await rejects(
      f.google.completeSignIn(flow),
      "Sign in with your existing method",
    );
    expect((await f.user(account.userId))!.googleSubject).toBeUndefined();
    await rejects(
      f.publicCaller.register({ email: "person@gmail.com", password }),
      "User already exists",
    );
    const tokens = action({
      name: "googleTestTokens",
      args: {},
      handler: function* () {
        return yield* selectFrom(tokensTable, "byUserId").where((q) =>
          q.eq("userId", account.userId),
        );
      },
    });
    expect(await asyncDispatch(f.db, tokens({}))).toHaveLength(1);
  });

  test("linking requires the original session and current password, and preserves app email", async () => {
    const f = await fixture();
    const account = await f.passwordAccount();
    const session = { userId: account.userId, tokenId: account.token };
    const flow = await f.ready(session);
    await rejects(
      f.google.completeLink(flow, session, "wrong-password"),
      "Incorrect password",
    );
    await rejects(f.publicCaller.google.completeLink({ ...flow, password }));
    const other = await f.passwordAccount("other@example.com");
    await rejects(other.caller.google.completeLink({ ...flow, password }));
    await account.caller.google.completeLink({ ...flow, password });
    expect(await f.user(account.userId)).toMatchObject({
      email: "app@example.com",
      googleEmail: "person@gmail.com",
    });
    expect((await f.google.completeSignIn(await f.ready())).userId).toBe(
      account.userId,
    );
    const conflicting = await f.ready({
      userId: other.userId,
      tokenId: other.token,
    });
    await rejects(
      other.caller.google.completeLink({ ...conflicting, password }),
      "another user",
    );
    await account.caller.google.disconnect({ password });
    expect((await f.user(account.userId))!.googleSubject).toBeUndefined();
    expect(await f.google.completeSignIn(await f.ready())).toBeDefined();
  });

  test("revocation during linking prevents completion; disconnect needs verified email", async () => {
    const f = await fixture();
    const account = await f.passwordAccount("unverified@example.com", false);
    const session = { userId: account.userId, tokenId: account.token };
    await f.google.completeLink(await f.ready(session), session, password);
    await rejects(f.google.disconnect(session, password), "Confirm your email");
    const pending = await f.ready(session);
    await asyncDispatch(
      f.db,
      revokeToken({ userId: account.userId, tokenId: account.token }),
    );
    await rejects(f.google.completeLink(pending, session, password));
  });

  test("non-authoritative email stays unverified; password reset establishes a password", async () => {
    const f = await fixture();
    f.setProfile({
      subject: "external",
      email: "external@example.com",
      emailAuthoritative: false,
    });
    const account = await f.google.completeSignIn(await f.ready());
    expect((await f.user(account.userId))!.emailVerifiedAt).toBeUndefined();
    // A real email challenge must be consumed, even for a passwordless account.
    await f.publicCaller.requestPasswordReset({
      email: "external@example.com",
    });
    const token = "test-email-recovery-secret";
    const setChallenge = action({
      name: "googleTestResetToken",
      args: {},
      handler: function* () {
        const challenge = (yield* selectFrom(
          emailChallengesTable,
          "byUserId",
        ).where((q) => q.eq("userId", account.userId))).find(
          (row) => row.purpose === "passwordReset",
        )!;
        yield* upsert(emailChallengesTable, [
          { ...challenge, tokenHash: hashSecret(token) },
        ]);
      },
    });
    await asyncDispatch(f.db, setChallenge({}));
    await f.publicCaller.resetPassword({ token, password });
    expect(
      await authenticateBearerToken(`Bearer ${account.token}`, f.db),
    ).toBeNull();
    const login = await f.publicCaller.login({
      email: "external@example.com",
      password,
    });
    await f.google.disconnect(
      { userId: account.userId, tokenId: login.token },
      password,
    );
    expect((await f.user(account.userId))!.googleSubject).toBeUndefined();
  });

  test("wrong proof, expired, cancelled, and denied flows never authenticate", async () => {
    const f = await fixture();
    const flow = await f.ready();
    await rejects(f.google.poll({ ...flow, secret: "wrong" }));
    await f.google.cancel(flow);
    await rejects(f.google.completeSignIn(flow));
    const expired = await f.ready();
    f.advance(600_001);
    await rejects(f.google.completeSignIn(expired));
    const denied = await f.google.begin(undefined, { desktop: true });
    const launch = new URL(denied.launchUrl).searchParams.get("launch")!;
    await f.google.launch(denied.id, launch, "cookie", {
      confirmationCode: denied.confirmationCode!,
    });
    await f.google.callback(denied.id, "cookie", undefined, true);
    expect((await f.google.poll(denied)).status).toBe("error");
    await rejects(f.google.completeSignIn(denied));
  });

  test("concurrent completion issues exactly one credential", async () => {
    const f = await fixture();
    const flow = await f.ready();
    const results = await Promise.allSettled([
      f.google.completeSignIn(flow),
      f.google.completeSignIn(flow),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });

  test("competing links give a Google identity exactly one owner", async () => {
    const f = await fixture();
    const first = await f.passwordAccount("first@example.com");
    const second = await f.passwordAccount("second@example.com");
    const firstSession = { userId: first.userId, tokenId: first.token };
    const secondSession = { userId: second.userId, tokenId: second.token };
    const firstFlow = await f.ready(firstSession);
    const secondFlow = await f.ready(secondSession);
    const results = await Promise.allSettled([
      f.google.completeLink(firstFlow, firstSession, password),
      f.google.completeLink(secondFlow, secondSession, password),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const users = [await f.user(first.userId), await f.user(second.userId)];
    expect(users.filter((user) => user?.googleSubject)).toHaveLength(1);
  });

  test("disabling Google still allows an authenticated user to disconnect", async () => {
    const f = await fixture();
    const account = await f.passwordAccount();
    const session = { userId: account.userId, tokenId: account.token };
    await f.google.completeLink(await f.ready(session), session, password);
    const caller = createAppRouter({
      mainDB: f.db,
      captchaConfig: null,
    }).createCaller({
      user: { id: account.userId, email: "app@example.com" },
      tokenId: account.token,
    });
    expect((await caller.getAuthConfig()).googleEnabled).toBe(false);
    await rejects(caller.google.beginSignIn(), "not configured");
    await caller.google.disconnect({ password });
    expect((await f.user(account.userId))!.googleSubject).toBeUndefined();
  });

  test("upgrades a persisted users table created before Google support", async () => {
    const directory = mkdtempSync(join(tmpdir(), "google-upgrade-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "main.sqlite");
    const legacyUsers = defineTable("users", {
      id: v.string(),
      email: v.string(),
      password: v.string(),
      createdAt: v.string(),
      updatedAt: v.string(),
      emailVerifiedAt: v.optional(v.string()),
    })
      .index("byIds", ["id"])
      .index("byEmail", ["email"]);
    const old = await fixture(path, legacyUsers);
    const addLegacy = action({
      name: "insertOriginalUserSchema",
      args: {},
      handler: function* () {
        yield* insert(legacyUsers, [
          {
            id: "old-user",
            email: "Original@Example.com",
            password: "old-hash",
            createdAt: "old",
            updatedAt: "old",
          },
        ]);
      },
    });
    await asyncDispatch(old.db, addLegacy({}));
    const upgraded = await fixture(path);
    await asyncDispatch(upgraded.db, backfillUserEmails({}));
    expect(await upgraded.user("old-user")).toMatchObject({
      email: "Original@Example.com",
      normalizedEmail: "original@example.com",
      password: "old-hash",
    });
    const account = await upgraded.google.completeSignIn(
      await upgraded.ready(),
    );
    expect((await upgraded.user(account.userId))!.password).toBeUndefined();
  });

  test("legacy email backfill preserves case-only duplicate accounts", async () => {
    const f = await fixture();
    const oldUsers = action({
      name: "googleTestLegacyEmails",
      args: {},
      handler: function* () {
        yield* upsert(
          usersTable,
          ["Legacy@example.com", "legacy@example.com"].map((email, index) => ({
            id: `legacy-${index}`,
            email,
            password: "legacy-hash",
            createdAt: "old",
            updatedAt: "old",
          })),
        );
      },
    });
    await asyncDispatch(f.db, oldUsers({}));
    await asyncDispatch(f.db, backfillUserEmails({}));
    await asyncDispatch(f.db, backfillUserEmails({}));
    expect((await f.user("legacy-0"))!.email).toBe("Legacy@example.com");
    expect((await f.user("legacy-1"))!.normalizedEmail).toBe(
      "legacy@example.com",
    );
    f.setProfile({
      subject: "legacy-google",
      email: "LEGACY@example.com",
      emailAuthoritative: false,
    });
    await rejects(f.google.completeSignIn(await f.ready()), "already exists");
  });

  test("password login and recovery prefer exact legacy emails before normalized lookup", async () => {
    const f = await fixture();
    const account = await f.passwordAccount("Original@Example.com");
    expect(
      (await f.publicCaller.login({ email: "ORIGINAL@EXAMPLE.COM", password }))
        .userId,
    ).toBe(account.userId);
    await f.publicCaller.requestPasswordReset({
      email: "ORIGINAL@EXAMPLE.COM",
    });
    const secondHash = await Bun.password.hash("second-password");
    const addDuplicate = action({
      name: "addCaseDuplicateForLoginTest",
      args: {},
      handler: function* () {
        const user = (yield* getUserById({ id: account.userId }))!;
        yield* insert(usersTable, [
          {
            ...user,
            id: "duplicate",
            email: "original@example.com",
            password: secondHash,
          },
        ]);
      },
    });
    await asyncDispatch(f.db, addDuplicate({}));
    expect(
      (await f.publicCaller.login({ email: "Original@Example.com", password }))
        .userId,
    ).toBe(account.userId);
    expect(
      (
        await f.publicCaller.login({
          email: "original@example.com",
          password: "second-password",
        })
      ).userId,
    ).toBe("duplicate");
    await rejects(
      f.publicCaller.login({ email: "original@example.com", password }),
      "Invalid credentials",
    );
    await f.publicCaller.requestPasswordReset({
      email: "original@example.com",
    });
    const challenges = action({
      name: "readDuplicateResetChallenges",
      args: {},
      handler: function* () {
        return yield* selectFrom(emailChallengesTable, "byId").where((q) => [
          q.eq("id", `${account.userId}:passwordReset`),
          q.eq("id", "duplicate:passwordReset"),
        ]);
      },
    });
    expect(
      (await asyncDispatch(f.db, challenges({})))
        .map((row) => row.userId)
        .sort(),
    ).toEqual([account.userId, "duplicate"].sort());
  });

  test("desktop launch requires app code and shows the link target account", async () => {
    const f = await fixture();
    const account = await f.passwordAccount("target@example.com");
    const server = createServer({
      appRouter: f.router,
      mainDB: f.db,
      google: f.google,
      serveFrontend: false,
      logger: false,
      rateLimit: { enabled: false, backend: "memory" },
    });
    cleanup.push(() => server.close());
    const flow = await f.google.begin(
      { userId: account.userId, tokenId: account.token },
      { desktop: true },
    );
    const url = new URL(flow.launchUrl);
    const page = await server.inject({ url: url.pathname + url.search });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("target@example.com");
    expect(page.body).toContain("Confirmation code");
    expect(page.body).not.toContain(flow.confirmationCode!);
    expect(page.headers.location).toBeUndefined();
    const payload = {
      id: flow.id,
      launch: url.searchParams.get("launch")!,
      confirmationCode: "x".repeat(12),
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: url.pathname,
          payload,
          headers: { origin: config.appUrl },
        })
      ).statusCode,
    ).toBe(400);
    payload.confirmationCode = flow.confirmationCode!;
    expect(
      (
        await server.inject({
          method: "POST",
          url: url.pathname,
          payload,
          headers: { origin: "https://attacker.example.com" },
        })
      ).statusCode,
    ).toBe(400);
    const launch = await server.inject({
      method: "POST",
      url: url.pathname,
      payload: new URLSearchParams(payload).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: config.appUrl,
      },
    });
    expect(launch.statusCode).toBe(303);
    expect(launch.headers.location).toContain(
      "https://accounts.google.test/authorize",
    );
    expect(
      (
        await server.inject({
          method: "POST",
          url: url.pathname,
          payload,
          headers: { origin: config.appUrl },
        })
      ).statusCode,
    ).toBe(400);
    const cookie = String(launch.headers["set-cookie"]).split(";")[0];
    expect(
      (
        await server.inject({
          url: `/api/auth/google/callback?state=${flow.id}&code=valid`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(await f.google.poll(flow)).toMatchObject({
      status: "ready",
      email: "person@gmail.com",
    });
  });

  test("HTTP launch binds the browser; tRPC completes through the real server", async () => {
    const f = await fixture();
    const server = createServer({
      appRouter: f.router,
      mainDB: f.db,
      google: f.google,
      serveFrontend: false,
      logger: false,
      rateLimit: { enabled: false, backend: "memory" },
    });
    cleanup.push(() => server.close());
    await server.listen({ host: "127.0.0.1", port: 0 });
    const base = server.listeningOrigin;
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${base}/api/trpc` })],
    });
    const begin = await server.inject({
      method: "POST",
      url: "/api/trpc/google.beginSignIn",
      payload: {},
    });
    expect(begin.statusCode).toBe(200);
    const flow = begin.json<{
      result: { data: Awaited<ReturnType<GoogleService["begin"]>> };
    }>().result.data;
    const initiatorCookie = String(begin.headers["set-cookie"]).split(";")[0];
    const launchUrl = `${base}${new URL(flow.launchUrl).pathname}${new URL(flow.launchUrl).search}`;
    expect((await fetch(launchUrl, { redirect: "manual" })).status).toBe(400);
    expect(
      (
        await fetch(launchUrl, {
          redirect: "manual",
          headers: { cookie: `wbd_google_${flow.id}=${"x".repeat(43)}` },
        })
      ).status,
    ).toBe(400);
    const launch = await fetch(launchUrl, {
      redirect: "manual",
      headers: { cookie: initiatorCookie },
    });
    expect(launch.status).toBe(302);
    const replay = await fetch(
      `${base}${new URL(flow.launchUrl).pathname}${new URL(flow.launchUrl).search}`,
      { redirect: "manual" },
    );
    expect(replay.status).toBe(400);
    const cookie = launch.headers.get("set-cookie")!.split(";")[0];
    const callback = `${base}/api/auth/google/callback?state=${flow.id}&code=valid`;
    expect((await fetch(callback)).status).toBe(400);
    expect(
      (
        await fetch(callback, {
          headers: { cookie: `wbd_google_${flow.id}=${"x".repeat(43)}` },
        })
      ).status,
    ).toBe(400);
    expect((await fetch(callback, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(callback, { headers: { cookie } })).status).toBe(400);
    expect(await client.google.poll.mutate(flow)).toMatchObject({
      status: "ready",
      email: null,
    });
    const result = await client.google.completeSignIn.mutate(flow);
    expect(
      await authenticateBearerToken(`Bearer ${result.token}`, f.db),
    ).toMatchObject({ id: result.userId });
  });

  test("pending and ready flows survive a database reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "google-flow-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "main.sqlite");
    const first = await fixture(path);
    const pending = await first.google.begin(undefined, { desktop: true });
    const flow = await first.ready();
    const second = await fixture(path);
    expect((await second.google.poll(pending)).status).toBe("pending");
    await second.google.launch(
      pending.id,
      new URL(pending.launchUrl).searchParams.get("launch")!,
      "reopened-browser",
      { confirmationCode: pending.confirmationCode! },
    );
    await second.google.callback(pending.id, "reopened-browser", "valid");
    expect((await second.google.poll(pending)).status).toBe("ready");
    expect((await second.google.poll(flow)).status).toBe("ready");
    const result = await second.google.completeSignIn(flow);
    expect((await first.user(result.userId))!.googleSubject).toBe(
      "google-user-1",
    );
  });
});

test("Google configuration is optional, complete, and restricts public URLs", () => {
  expect(parseGoogleConfig({})).toBeNull();
  expect(() => parseGoogleConfig({ WBD_GOOGLE_CLIENT_ID: "id" })).toThrow();
  for (const url of [
    "http://example.com",
    "https://example.com/path",
    "https://user:pass@example.com",
    "https://example.com?redirect=other",
  ]) {
    expect(() =>
      parseGoogleConfig({
        WBD_GOOGLE_CLIENT_ID: "id",
        WBD_GOOGLE_CLIENT_SECRET: "secret",
        WBD_GOOGLE_PUBLIC_APP_URL: url,
      }),
    ).toThrow();
  }
  expect(
    parseGoogleConfig({
      WBD_GOOGLE_CLIENT_ID: "id",
      WBD_GOOGLE_CLIENT_SECRET: "secret",
      WBD_GOOGLE_PUBLIC_APP_URL: "http://localhost:5173",
    })!.appUrl,
  ).toBe("http://localhost:5173");
});
