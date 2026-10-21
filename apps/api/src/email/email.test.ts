import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, createWSClient, wsLink } from "@trpc/client";
import {
  DB,
  asyncDispatch,
  execAsync,
  selectFrom,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { AsyncSqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import { createAppRouter, type AppRouter } from "../appRouter";
import { subscriptionManager } from "../subscriptionManager";
import { createServer } from "../server";
import { action } from "../builders";
import { generateToken, getUserById } from "../slices/authSlice";
import { tokensTable, usersTable } from "../slices/tables";
import { authenticateBearerToken } from "../services/authentication";
import {
  claimEmailJob,
  cleanEmailJobs,
  consumeEmailChallenge,
  finishEmailJob,
  hashEmailToken,
  HOUR,
  requestReset,
  requestVerification,
} from "./actions";
import { parseEmailConfig, type EmailConfig } from "./config";
import {
  accountEmailTables,
  emailChallengesTable,
  emailOutboxTable,
} from "./tables";
import {
  createAccountEmailService,
  createEmailWorker,
  createResendSender,
  EmailDeliveryError,
  type EmailSender,
} from "./service";
import { renderAccountEmail, type EmailPayload } from "./templates";

const config: EmailConfig = {
  apiKey: "test-only",
  from: "Will Be Done <accounts@example.com>",
  appUrl: "https://app.example.com",
};
const tables = [usersTable, tokensTable, ...accountEmailTables];
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function sqlite(path = ":memory:") {
  const sql = new Database(path);
  sql.run("PRAGMA journal_mode=WAL");
  sql.run("PRAGMA busy_timeout=50");
  const db = new DB(
    new AsyncSqlDriver({
      async exec(query, params) {
        sql.run(query, params ?? []);
      },
      prepare(query) {
        const stmt = sql.prepare(query);
        return {
          values: async (params) =>
            stmt.values(...params) as (string | number | Uint8Array | null)[][],
          finalize: () => stmt.finalize(),
        };
      },
    }),
  );
  await execAsync(db.loadTables(tables));
  return { db, close: () => sql.close() };
}

async function fixture(engine = "memory") {
  const db =
    engine === "sqlite"
      ? await (async () => {
          const opened = await sqlite();
          cleanups.push(opened.close);
          return opened.db;
        })()
      : new DB(new BptreeInmemDriver());
  await execAsync(db.loadTables(tables));
  const service = createAccountEmailService(db, config);
  const messages: EmailPayload[] = [];
  const sender: EmailSender = {
    async send(payload) {
      messages.push(payload);
      return `sent-${messages.length}`;
    },
  };
  const worker = createEmailWorker(db, sender, { paceMs: 0, log: () => {} });
  cleanups.push(() => worker.stop());
  return { db, service, messages, worker };
}

const readJobsAction = action({
  name: "readEmailJobsForTest",
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
  },
  handler: function* ({ status }) {
    return yield* selectFrom(emailOutboxTable, "byDue").where((q) =>
      q.eq("status", status),
    );
  },
});
const findChallenge = action({
  name: "findEmailChallengeForTest",
  args: { tokenHash: v.string() },
  handler: function* ({ tokenHash }) {
    return yield* selectFrom(emailChallengesTable, "byTokenHash")
      .where((q) => q.eq("tokenHash", tokenHash))
      .first();
  },
});
const readJobs = (
  db: DB,
  status: "pending" | "sent" | "failed" | "cancelled" = "pending",
) => asyncDispatch(db, readJobsAction({ status }));
const linkToken = (payload: EmailPayload) => {
  const url = new URL(payload.text.match(/https:\/\/[^\s]+#token=[^\s]+/)![0]);
  return new URLSearchParams(url.hash.slice(1)).get("token")!;
};

for (const engine of ["memory", "sqlite"])
  describe(`account email (${engine})`, () => {
    test("signup grants access, verification is single-use, and welcome is sent once", async () => {
      const { db, service, worker, messages } = await fixture(engine);
      const account = await service.register("new@example.com", "old-hash");
      expect(
        await authenticateBearerToken(`Bearer ${account.token}`, db),
      ).toMatchObject({ id: account.userId });
      expect(
        (await asyncDispatch(db, getUserById({ id: account.userId })))
          ?.emailVerifiedAt,
      ).toBeUndefined();
      await worker.runOnce();
      expect(messages.map((m) => m.subject)).toEqual(["Confirm your email"]);
      const token = linkToken(messages[0]);
      const challenge = await asyncDispatch(
        db,
        findChallenge({ tokenHash: hashEmailToken(token) }),
      );
      expect(challenge?.tokenHash).not.toEqual(token);
      const results = await Promise.allSettled([
        service.verify(token),
        service.verify(token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (await asyncDispatch(db, getUserById({ id: account.userId })))
          ?.emailVerifiedAt,
      ).toBeString();
      await worker.runOnce();
      expect(messages.map((m) => m.subject)).toEqual([
        "Confirm your email",
        "Welcome to Will Be Done",
      ]);
      expect(await service.requestVerification(account.userId)).toEqual({
        queued: false,
        retryAfterSeconds: 0,
      });
      expect(
        (await readJobs(db, "sent")).every(
          (job) => !job.payload && !job.leaseId,
        ),
      ).toBe(true);
    });

    test("resends invalidate old links and pending payloads; cooldown and hourly limits persist", async () => {
      const { db, service, worker, messages } = await fixture(engine);
      const account = await service.register("resend@example.com", "hash");
      const firstJob = (await readJobs(db))[0];
      const firstToken = linkToken(JSON.parse(firstJob.payload!));
      const now = firstJob.createdAt;
      expect(
        await asyncDispatch(
          db,
          requestVerification({
            userId: account.userId,
            config,
            now: now + 1000,
          }),
        ),
      ).toMatchObject({ queued: false, retryAfterSeconds: 59 });
      expect(
        await asyncDispatch(
          db,
          requestVerification({
            userId: account.userId,
            config,
            now: now + 60_000,
          }),
        ),
      ).toMatchObject({ queued: true });
      expect((await readJobs(db, "cancelled"))[0].payload).toBeUndefined();
      await expectRejection(
        service.verify(firstToken),
        "invalid, expired, or already used",
      );
      expect(
        await asyncDispatch(
          db,
          requestVerification({
            userId: account.userId,
            config,
            now: now + 120_000,
          }),
        ),
      ).toMatchObject({ queued: true });
      expect(
        await asyncDispatch(
          db,
          requestVerification({
            userId: account.userId,
            config,
            now: now + 180_000,
          }),
        ),
      ).toMatchObject({ queued: false, retryAfterSeconds: 3420 });
      // The last job is scheduled in the future relative to the real clock.
      const futureWorker = createEmailWorker(
        db,
        {
          async send(p) {
            messages.push(p);
            return "latest";
          },
        },
        { now: () => now + 180_000, paceMs: 0, log: () => {} },
      );
      await futureWorker.runOnce();
      expect(messages).toHaveLength(1);
      await service.verify(linkToken(messages[0]));
      await worker.stop();
    });

    test("reset verifies ownership, revokes tokens, cancels links and enqueues both notifications", async () => {
      const { db, service } = await fixture(engine);
      const account = await service.register("reset@example.com", "old-hash");
      const apiToken = await asyncDispatch(
        db,
        generateToken({ userId: account.userId }),
      );
      expect(await service.requestReset("unknown@example.com")).toEqual({
        success: true,
      });
      expect(await service.requestReset("reset@example.com")).toEqual({
        success: true,
      });
      const job = (await readJobs(db)).find((j) => j.kind === "passwordReset")!;
      const token = linkToken(JSON.parse(job.payload!));
      await expectRejection(
        service.verify(token),
        "invalid, expired, or already used",
      );
      const results = await Promise.allSettled([
        service.reset(token, "new-password-123"),
        service.reset(token, "another-password-456"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await authenticateBearerToken(`Bearer ${account.token}`, db),
      ).toBeNull();
      expect(
        await authenticateBearerToken(`Bearer ${apiToken.token}`, db),
      ).toBeNull();
      const user = (await asyncDispatch(
        db,
        getUserById({ id: account.userId }),
      ))!;
      expect(user.emailVerifiedAt).toBeString();
      expect(user.password).not.toBe("old-hash");
      expect(
        (await Bun.password.verify("new-password-123", user.password)) ||
          (await Bun.password.verify("another-password-456", user.password)),
      ).toBe(true);
      expect((await readJobs(db)).map((j) => j.kind).sort()).toEqual([
        "passwordChanged",
        "welcome",
      ]);
      expect((await readJobs(db, "cancelled")).every((j) => !j.payload)).toBe(
        true,
      );
      await expectRejection(
        asyncDispatch(
          db,
          generateToken({ userId: user.id, expectedPassword: "old-hash" }),
        ),
        "Invalid credentials",
      );
    });

    test("invalid reset links skip hashing through the service and HTTP endpoint", async () => {
      const { db, service } = await fixture(engine);
      const account = await service.register(
        "precheck@example.com",
        "original-hash",
      );
      const verificationToken = linkToken(
        JSON.parse((await readJobs(db))[0].payload!),
      );
      await asyncDispatch(
        db,
        requestReset({
          email: "precheck@example.com",
          config,
          now: Date.now() - 2 * HOUR,
        }),
      );
      const expiredToken = linkToken(
        JSON.parse(
          (await readJobs(db)).find((j) => j.kind === "passwordReset")!
            .payload!,
        ),
      );
      const server = createServer({
        mainDB: db,
        appRouter: createAppRouter({
          mainDB: db,
          captchaConfig: null,
          accountEmail: service,
        }),
        logger: false,
        serveFrontend: false,
        rateLimit: { enabled: false, backend: "memory" },
      });
      cleanups.push(() => server.close());
      const hash = spyOn(Bun.password, "hash");
      async function rejectToken(token: string) {
        await expectRejection(
          service.reset(token, "replacement-password"),
          "invalid, expired, or already used",
        );
        expect(
          (
            await server.inject({
              method: "POST",
              url: "/api/trpc/resetPassword",
              payload: { token, password: "replacement-password" },
            })
          ).statusCode,
        ).toBe(400);
      }
      try {
        for (const token of ["missing-token", verificationToken, expiredToken])
          await rejectToken(token);
        expect(hash).not.toHaveBeenCalled();
        await service.requestReset("precheck@example.com");
        const token = linkToken(
          JSON.parse(
            (await readJobs(db)).find((j) => j.kind === "passwordReset")!
              .payload!,
          ),
        );
        await service.reset(token, "replacement-password");
        await rejectToken(token);
        expect(hash).toHaveBeenCalledTimes(1);
        const user = (await asyncDispatch(
          db,
          getUserById({ id: account.userId }),
        ))!;
        expect(
          await Bun.password.verify("replacement-password", user.password),
        ).toBe(true);
      } finally {
        hash.mockRestore();
      }
    });

    test("reset rechecks the challenge if it is consumed while hashing", async () => {
      const { db, service } = await fixture(engine);
      const account = await service.register(
        "race@example.com",
        "original-hash",
      );
      await service.requestReset("race@example.com");
      const token = linkToken(
        JSON.parse(
          (await readJobs(db)).find((j) => j.kind === "passwordReset")!
            .payload!,
        ),
      );
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const hash = spyOn(Bun.password, "hash").mockImplementation(async () => {
        started.resolve();
        await release.promise;
        return "loser-hash";
      });
      const pending = service.reset(token, "replacement-password");
      try {
        await started.promise;
        await asyncDispatch(
          db,
          consumeEmailChallenge({
            tokenHash: hashEmailToken(token),
            purpose: "passwordReset",
            hashedPassword: "winner-hash",
            config,
            now: Date.now(),
          }),
        );
        release.resolve();
        await expectRejection(pending, "invalid, expired, or already used");
        expect(
          (await asyncDispatch(db, getUserById({ id: account.userId })))
            ?.password,
        ).toBe("winner-hash");
      } finally {
        release.resolve();
        await pending.catch(() => {});
        hash.mockRestore();
      }
    });

    test("expired and wrong-purpose links cannot mutate credentials", async () => {
      const { db, service } = await fixture(engine);
      const account = await service.register(
        "expiry@example.com",
        "original-hash",
      );
      const verificationToken = linkToken(
        JSON.parse((await readJobs(db))[0].payload!),
      );
      await expectRejection(
        asyncDispatch(
          db,
          consumeEmailChallenge({
            tokenHash: hashEmailToken(verificationToken),
            purpose: "verification",
            config,
            now: Date.now() + 25 * HOUR,
          }),
        ),
        "invalid, expired, or already used",
      );
      await service.requestReset("expiry@example.com");
      const token = linkToken(
        JSON.parse(
          (await readJobs(db)).find((j) => j.kind === "passwordReset")!
            .payload!,
        ),
      );
      await expectRejection(
        asyncDispatch(
          db,
          consumeEmailChallenge({
            tokenHash: hashEmailToken(token),
            purpose: "passwordReset",
            hashedPassword: "bad",
            config,
            now: Date.now() + 2 * HOUR,
          }),
        ),
        "invalid, expired, or already used",
      );
      expect(
        (await asyncDispatch(db, getUserById({ id: account.userId })))
          ?.password,
      ).toBe("original-hash");
    });
  });

describe("durable delivery", () => {
  test("outbox and leases survive database reopen; competing claims cannot send twice", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wbd-email-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "main.sqlite");
    let opened = await sqlite(path);
    await createAccountEmailService(opened.db, config).register(
      "restart@example.com",
      "hash",
    );
    const now = Date.now();
    const claims = await Promise.all(
      ["first", "second"].map((leaseId) =>
        asyncDispatch(opened.db, claimEmailJob({ now, leaseId })),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    opened.close();
    opened = await sqlite(path);
    cleanups.push(opened.close);
    expect(
      await asyncDispatch(
        opened.db,
        claimEmailJob({ now: now + 59_000, leaseId: "too-early" }),
      ),
    ).toBeNull();
    const recovered = await asyncDispatch(
      opened.db,
      claimEmailJob({ now: now + 61_000, leaseId: "recovered" }),
    );
    expect(recovered?.id).toBe(claims.find(Boolean)!.id);
    await asyncDispatch(
      opened.db,
      finishEmailJob({
        id: recovered!.id,
        leaseId: "first",
        providerId: "stale",
        now: now + 61_000,
      }),
    );
    expect((await readJobs(opened.db))[0].leaseId).toBe("recovered");
    await asyncDispatch(
      opened.db,
      finishEmailJob({
        id: recovered!.id,
        leaseId: "recovered",
        providerId: "delivered",
        now: now + 61_000,
      }),
    );
    expect((await readJobs(opened.db, "sent"))[0]).toMatchObject({
      providerId: "delivered",
      attempts: 2,
    });
    expect((await readJobs(opened.db, "sent"))[0].payload).toBeUndefined();
  });

  test("stop waits for the active drain and resolves even if it fails", async () => {
    const { db, service } = await fixture();
    await service.register("shutdown@example.com", "hash");
    const failure = new Error("drain logging failed");
    let markStarted!: () => void;
    let releaseSend!: (id: string) => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const delivery = new Promise<string>((resolve) => {
      releaseSend = resolve;
    });
    const worker = createEmailWorker(
      db,
      {
        send() {
          markStarted();
          return delivery;
        },
      },
      {
        paceMs: 0,
        log() {
          throw failure;
        },
      },
    );
    cleanups.push(() => worker.stop());
    const drainResult = worker.runOnce().catch((error: unknown) => error);
    await started;
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });
    try {
      await Promise.resolve();
      expect(stopped).toBe(false);
    } finally {
      releaseSend("provider-id");
      await stopping;
    }
    expect(await drainResult).toBe(failure);
    expect(stopped).toBe(true);
  });

  test("retry keeps identical payload and idempotency key when the provider accepted before disconnect", async () => {
    const { db, service } = await fixture();
    await service.register("retry@example.com", "hash");
    let now = Date.now();
    const calls: { payload: EmailPayload; key: string }[] = [];
    const sender: EmailSender = {
      async send(payload, key) {
        calls.push({ payload, key });
        if (calls.length === 1)
          throw new EmailDeliveryError("timeout", true, 120_000);
        return "provider-original-id";
      },
    };
    const worker = createEmailWorker(db, sender, {
      now: () => now,
      paceMs: 0,
      log: () => {},
    });
    await worker.runOnce();
    expect((await readJobs(db))[0].nextAttemptAt).toBe(now + 120_000);
    now += 119_000;
    await worker.runOnce();
    expect(calls).toHaveLength(1);
    now += 1000;
    await worker.runOnce();
    expect(calls[1]).toEqual(calls[0]);
    expect((await readJobs(db, "sent"))[0].providerId).toBe(
      "provider-original-id",
    );
  });

  test("permanent failures, expiry, cleanup, and superseded claims remove payloads", async () => {
    const { db, service } = await fixture();
    await service.register("failure@example.com", "hash");
    const worker = createEmailWorker(
      db,
      {
        async send() {
          throw new EmailDeliveryError("invalid_api_key", false);
        },
      },
      { paceMs: 0, log: () => {} },
    );
    await worker.runOnce();
    expect((await readJobs(db, "failed"))[0]).toMatchObject({
      failureCode: "invalid_api_key",
    });
    expect((await readJobs(db, "failed"))[0].payload).toBeUndefined();
    await service.register("expiry@example.com", "hash");
    await asyncDispatch(
      db,
      cleanEmailJobs({ now: Date.now() + 8 * 24 * HOUR }),
    );
    expect(await readJobs(db, "failed")).toHaveLength(0);
    // Cleanup must never delete pending jobs with an absent finishedAt index key.
    expect(await readJobs(db)).toHaveLength(1);
    await asyncDispatch(
      db,
      claimEmailJob({ now: Date.now() + 24 * HOUR, leaseId: "expired" }),
    );
    expect(await readJobs(db)).toHaveLength(0);
    expect((await readJobs(db, "failed"))[0].payload).toBeUndefined();
  });
});

describe("configuration and templates", () => {
  test("email is optional, partial or unsafe configuration fails", () => {
    expect(parseEmailConfig({})).toBeNull();
    expect(() => parseEmailConfig({ WBD_EMAIL_RESEND_API_KEY: "key" })).toThrow(
      "together",
    );
    const env = {
      WBD_EMAIL_RESEND_API_KEY: "key",
      WBD_EMAIL_FROM: config.from,
      WBD_EMAIL_PUBLIC_APP_URL: config.appUrl,
    };
    expect(parseEmailConfig(env)).toEqual({ ...config, apiKey: "key" });
    for (const url of [
      "http://app.example.com",
      "https://app.example.com/path",
      "https://user:pass@app.example.com",
      "https://app.example.com?redirect=evil",
    ])
      expect(() =>
        parseEmailConfig({ ...env, WBD_EMAIL_PUBLIC_APP_URL: url }),
      ).toThrow();
    expect(
      parseEmailConfig({
        ...env,
        WBD_EMAIL_PUBLIC_APP_URL: "http://localhost:5174",
      })?.appUrl,
    ).toBe("http://localhost:5174");
  });

  test("all templates have text, HTML, trusted fragment links, and no password", () => {
    for (const kind of [
      "verification",
      "welcome",
      "passwordReset",
      "passwordChanged",
    ] as const) {
      const payload = renderAccountEmail(
        config,
        "user@example.com",
        kind,
        kind === "verification" || kind === "passwordReset"
          ? "safe-token"
          : undefined,
      );
      expect(payload.text).toContain(config.appUrl);
      expect(payload.html).toContain("Will Be Done");
      if (kind === "verification" || kind === "passwordReset")
        expect(payload.text).toContain("#token=safe-token");
    }
  });
});

describe("real Fastify account endpoints", () => {
  test("default limits allow shared-IP recovery flows and separate sending from consumption", async () => {
    const { db, service } = await fixture("sqlite");
    const server = createServer({
      mainDB: db,
      appRouter: createAppRouter({
        mainDB: db,
        captchaConfig: null,
        accountEmail: service,
      }),
      logger: false,
      serveFrontend: false,
    });
    cleanups.push(() => server.close());
    async function call(name: string, payload: unknown, token?: string) {
      return server.inject({
        method: "POST",
        url: `/api/trpc/${name}`,
        remoteAddress: "203.0.113.10",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        payload: JSON.stringify(payload),
      });
    }
    for (let i = 0; i < 3; i++) {
      const email = `office-${i}@example.com`;
      await service.register(email, "original-hash");
      expect((await call("requestPasswordReset", { email })).statusCode).toBe(
        200,
      );
      const job = (await readJobs(db)).find((j) => j.kind === "passwordReset")!;
      expect(
        (
          await call("resetPassword", {
            token: linkToken(JSON.parse(job.payload!)),
            password: "replacement-password",
          })
        ).statusCode,
      ).toBe(200);
    }
    const verifier = await service.register(
      "verifier@example.com",
      "original-hash",
    );
    const verification = (await readJobs(db)).find(
      (j) => j.kind === "verification",
    )!;
    expect(
      (await call("requestEmailVerification", null, verifier.token)).statusCode,
    ).toBe(200);
    for (let i = 0; i < 6; i++)
      expect(
        (await call("requestPasswordReset", { email: "missing@example.com" }))
          .statusCode,
      ).toBe(200);
    const limitedSend = await call("requestPasswordReset", {
      email: "missing@example.com",
    });
    expect(limitedSend.statusCode).toBe(429);
    expect(limitedSend.json().error.message).toMatch(
      /Try again in (29\d|300) seconds/,
    );
    expect(
      (await call("requestEmailVerification", null, verifier.token)).statusCode,
    ).toBe(429);
    // Even an exhausted sending budget must allow an already issued link.
    expect(
      (
        await call("verifyEmail", {
          token: linkToken(JSON.parse(verification.payload!)),
        })
      ).statusCode,
    ).toBe(200);
    for (let i = 0; i < 6; i++) {
      expect(
        (
          await call(i % 2 ? "verifyEmail" : "resetPassword", {
            token: "invalid-token",
            password: "replacement-password",
          })
        ).statusCode,
      ).toBe(400);
    }
    for (const name of ["verifyEmail", "resetPassword"]) {
      const limitedConsume = await call(name, {
        token: "invalid-token",
        password: "replacement-password",
      });
      expect(limitedConsume.statusCode).toBe(429);
      expect(limitedConsume.json().error.message).toMatch(
        /Try again in (29\d|300) seconds/,
      );
    }
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/api/trpc/requestPasswordReset",
          remoteAddress: "203.0.113.11",
          payload: { email: "missing@example.com" },
        })
      ).statusCode,
    ).toBe(200);
  });

  test("signup, verification, reset and login work against a real database and HTTP server", async () => {
    const { db, service, worker, messages } = await fixture("sqlite");
    const server = createServer({
      mainDB: db,
      appRouter: createAppRouter({
        mainDB: db,
        captchaConfig: null,
        accountEmail: service,
      }),
      logger: false,
      serveFrontend: false,
      rateLimit: { enabled: false, backend: "memory" },
    });
    const base = await server.listen({ host: "127.0.0.1", port: 0 });
    cleanups.push(() => server.close());
    async function call(name: string, input: unknown, token?: string) {
      const response = await fetch(`${base}/api/trpc/${name}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      return { status: response.status, body: await response.json() };
    }
    const registered = await call("register", {
      email: "http@example.com",
      password: "password1",
    });
    expect(registered.status).toBe(200);
    const session = (
      registered.body as { result: { data: { userId: string; token: string } } }
    ).result.data;
    expect(
      await authenticateBearerToken(`Bearer ${session.token}`, db),
    ).not.toBeNull();
    await worker.runOnce();
    const verification = linkToken(messages[0]);
    expect((await call("verifyEmail", { token: verification })).status).toBe(
      200,
    );
    expect((await call("verifyEmail", { token: verification })).status).toBe(
      400,
    );
    expect(
      (await call("requestPasswordReset", { email: "http@example.com" })).body,
    ).toEqual(
      (await call("requestPasswordReset", { email: "missing@example.com" }))
        .body,
    );
    await worker.runOnce();
    const reset = linkToken(
      messages.find((m) => m.subject === "Reset your password")!,
    );
    const resetResult = await call("resetPassword", {
      token: reset,
      password: "changed-password",
    });
    expect(resetResult.status).toBe(200);
    expect((await call("createToken", undefined, session.token)).status).toBe(
      401,
    );
    expect(
      (
        await call("login", {
          email: "http@example.com",
          password: "password1",
        })
      ).status,
    ).not.toBe(200);
    expect(
      (
        await call("login", {
          email: "http@example.com",
          password: "changed-password",
        })
      ).status,
    ).toBe(200);
    await worker.runOnce();
    expect(
      messages.filter((m) => m.subject === "Welcome to Will Be Done"),
    ).toHaveLength(1);
    expect(
      messages.filter((m) => m.subject === "Your password was changed"),
    ).toHaveLength(1);
  });

  test("established WebSocket connections cannot mint tokens after reset", async () => {
    const { db, service } = await fixture("sqlite");
    const account = await service.register("socket@example.com", "hash");
    const server = createServer({
      mainDB: db,
      appRouter: createAppRouter({
        mainDB: db,
        captchaConfig: null,
        accountEmail: service,
      }),
      logger: false,
      serveFrontend: false,
      rateLimit: { enabled: false, backend: "memory" },
    });
    const base = await server.listen({ host: "127.0.0.1", port: 0 });
    cleanups.push(() => server.close());
    const ws = createWSClient({
      url: `${base.replace("http", "ws")}/api/trpc?token=${account.token}`,
      WebSocket,
    });
    cleanups.push(() => {
      void ws.close();
    });
    const client = createTRPCClient<AppRouter>({
      links: [wsLink({ client: ws })],
    });
    expect(await client.createToken.mutate()).toHaveProperty("id");
    await service.requestReset("socket@example.com");
    const token = linkToken(
      JSON.parse(
        (await readJobs(db)).find((j) => j.kind === "passwordReset")!.payload!,
      ),
    );
    await service.reset(token, "replacement-password");
    await expectRejection(client.createToken.mutate());
  });

  test("email-disabled installs retain signup and login; sending is rate limited", async () => {
    const { db, service } = await fixture("sqlite");
    const disabled = createAppRouter({
      mainDB: db,
      captchaConfig: null,
    }).createCaller({ user: null });
    expect(await disabled.getAuthConfig()).toEqual({ emailEnabled: false });
    await expectRejection(
      disabled.requestPasswordReset({ email: "test@example.com" }),
      "not configured",
    );
    const user = await disabled.register({
      email: "legacy@example.com",
      password: "password1",
    });
    expect(
      await disabled.login({
        email: "legacy@example.com",
        password: "password1",
      }),
    ).toHaveProperty("token");
    expect(await readJobs(db)).toHaveLength(0);
    const server = createServer({
      mainDB: db,
      appRouter: createAppRouter({
        mainDB: db,
        captchaConfig: null,
        accountEmail: service,
      }),
      logger: false,
      serveFrontend: false,
      rateLimit: {
        backend: "memory",
        policyOverrides: { accountEmailSend: { max: 1 } },
      },
    });
    cleanups.push(() => server.close());
    const request = {
      method: "POST" as const,
      url: "/api/trpc/requestEmailVerification",
      headers: {
        authorization: `Bearer ${user.token}`,
        "content-type": "application/json",
      },
      payload: "null",
    };
    expect((await server.inject(request)).statusCode).toBe(200);
    expect((await server.inject(request)).statusCode).toBe(429);
    expect((await readJobs(db))[0].kind).toBe("verification");
  });
});

async function expectRejection(promise: Promise<unknown>, message?: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (message) expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error("Expected operation to reject");
}

describe("Resend SDK integration", () => {
  test("uses the SDK with idempotency keys and classifies provider failures", async () => {
    const calls: { body: unknown; key: string | null }[] = [];
    let status = 200;
    const fake = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        calls.push({
          body: await request.json(),
          key: request.headers.get("idempotency-key"),
        });
        if (status === 200) return Response.json({ id: "provider-id" });
        return Response.json(
          {
            name: status === 429 ? "rate_limit_exceeded" : "invalid_api_key",
            message: "test",
          },
          { status, headers: { "retry-after": "120" } },
        );
      },
    });
    cleanups.push(async () => {
      await fake.stop(true);
    });
    const sender = createResendSender("test-key", {
      baseUrl: `http://127.0.0.1:${fake.port}`,
    });
    const payload = renderAccountEmail(
      config,
      "sdk@example.com",
      "verification",
      "test-token",
    );
    expect(await sender.send(payload, "job-1")).toBe("provider-id");
    expect(calls[0]).toEqual({ body: payload, key: "job-1" });
    status = 429;
    const limited = await sender.send(payload, "job-2").catch((error) => error);
    expect(limited).toMatchObject({
      retryable: true,
      retryAfterMs: 120_000,
      code: "rate_limit_exceeded",
    });
    status = 401;
    expect(
      await sender.send(payload, "job-3").catch((error) => error),
    ).toMatchObject({ retryable: false, code: "invalid_api_key" });
  });
});

test("revoked sessions cannot receive further subscription notifications", async () => {
  const { db, service } = await fixture("sqlite");
  const user = await service.register("notify@example.com", "hash");
  const caller = createAppRouter({
    mainDB: db,
    captchaConfig: null,
    accountEmail: service,
  }).createCaller({
    user: { id: user.userId, email: "notify@example.com" },
    revalidateUser: () => authenticateBearerToken(`Bearer ${user.token}`, db),
  });
  const stream = await caller.onChangesAvailable({
    dbId: user.userId,
    dbType: "user",
    syncVersion: 4,
  });
  const iterator = stream[Symbol.asyncIterator]();
  try {
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await subscriptionManager.notifyChangesAvailable(user.userId, "user");
    expect((await first).done).toBe(false);
    await service.requestReset("notify@example.com");
    const token = linkToken(
      JSON.parse(
        (await readJobs(db)).find((job) => job.kind === "passwordReset")!
          .payload!,
      ),
    );
    await service.reset(token, "replacement-password");
    const next = iterator.next();
    const rejected = expectRejection(next, "UNAUTHORIZED");
    await subscriptionManager.notifyChangesAvailable(user.userId, "user");
    await rejected;
  } finally {
    await iterator.return?.();
  }
});

test("token creation authenticated before a reset cannot issue a new token after it", async () => {
  const { db, service } = await fixture("sqlite");
  const account = await service.register("race@example.com", "hash");
  const caller = createAppRouter({
    mainDB: db,
    captchaConfig: null,
    accountEmail: service,
  }).createCaller({
    user: { id: account.userId, email: "race@example.com" },
    tokenId: account.token,
  });
  await service.requestReset("race@example.com");
  const token = linkToken(
    JSON.parse(
      (await readJobs(db)).find((job) => job.kind === "passwordReset")!
        .payload!,
    ),
  );
  await service.reset(token, "replacement-password");
  await expectRejection(caller.createToken(), "UNAUTHORIZED");
});

describe("email workers on separate database connections", () => {
  async function sharedDatabase() {
    const directory = mkdtempSync(join(tmpdir(), "wbd-email-shared-"));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "main.sqlite");
    const first = await sqlite(path);
    const second = await sqlite(path);
    cleanups.push(first.close, second.close);
    await createAccountEmailService(first.db, config).register(
      "shared@example.com",
      "hash",
    );
    return { first: first.db, second: second.db };
  }

  test("competing workers deliver one job once and recover from SQLite contention", async () => {
    const { first, second } = await sharedDatabase();
    const calls: string[] = [];
    const sender: EmailSender = {
      async send(_payload, key) {
        calls.push(key);
        return "shared-provider-id";
      },
    };
    const options = { paceMs: 0, log: () => {} };
    const workerA = createEmailWorker(first, sender, options);
    const workerB = createEmailWorker(second, sender, options);
    cleanups.push(
      () => workerA.stop(),
      () => workerB.stop(),
    );
    // A deferred SQLite transaction may lose its write upgrade to the other
    // connection. The worker's next poll retries after the winner commits.
    await Promise.allSettled([workerA.runOnce(), workerB.runOnce()]);
    await workerA.runOnce();
    await workerB.runOnce();
    expect(calls).toHaveLength(1);
    expect(await readJobs(first)).toHaveLength(0);
    expect((await readJobs(second, "sent"))[0]).toMatchObject({
      providerId: "shared-provider-id",
    });
  });

  test("a replacement worker reclaims a stalled sender with the same provider idempotency key", async () => {
    const { first, second } = await sharedDatabase();
    let now = Date.now();
    const calls: { payload: EmailPayload; key: string }[] = [];
    const accepted = new Map<string, string>();
    function accept(payload: EmailPayload, key: string) {
      calls.push({ payload, key });
      if (!accepted.has(key))
        accepted.set(key, `provider-${accepted.size + 1}`);
      return accepted.get(key)!;
    }
    let releaseFirst!: (id: string) => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const workerA = createEmailWorker(
      first,
      {
        async send(payload, key) {
          const id = accept(payload, key);
          markStarted();
          await new Promise<string>((resolve) => {
            releaseFirst = resolve;
          });
          return id;
        },
      },
      { now: () => now, paceMs: 0, log: () => {} },
    );
    const workerB = createEmailWorker(
      second,
      {
        async send(payload, key) {
          return accept(payload, key);
        },
      },
      { now: () => now, paceMs: 0, log: () => {} },
    );
    const pending = workerA.runOnce();
    await started;
    now += 61_000;
    try {
      await workerB.runOnce();
    } finally {
      releaseFirst("provider-1");
      await pending;
      await workerA.stop();
      await workerB.stop();
    }
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(accepted.size).toBe(1);
    expect((await readJobs(first, "sent"))[0]).toMatchObject({
      providerId: "provider-1",
      attempts: 2,
    });
    expect(await readJobs(second)).toHaveLength(0);
  });
});
