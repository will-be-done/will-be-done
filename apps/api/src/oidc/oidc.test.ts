import { describe, expect, test } from "bun:test";
import {
  DB,
  asyncDispatch,
  execSync,
  selectAsync,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createAppRouter } from "../appRouter";
import { authenticateBearerToken } from "../services/authentication";
import { getUserById, register, revokeToken } from "../slices/authSlice";
import { tokensTable, usersTable } from "../slices/tables";
import { createServer } from "../server";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../appRouter";
import { parseOidcConfig } from "./config";
import { createOidcService } from "./service";
import { oidcFlowsTable } from "./tables";
import { accountEmailTables } from "../email/tables";
import { createAccountEmailService } from "../email/service";

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
  issuer: "https://identity.example.com/realms/tasks",
  clientId: "tasks",
  clientSecret: "secret",
  appUrl: "https://tasks.example.com",
  name: "Company SSO",
};

function fixture() {
  const db = new DB(new BptreeInmemDriver());
  execSync(db.loadTables([usersTable, tokensTable, oidcFlowsTable]));
  let time = 1_800_000_000_000;
  let email = "person@example.com";
  const options = {
    now: () => time,
    provider: {
      authorizationUrl: (flow: { id: string }) =>
        `https://identity.example.com/authorize?state=${flow.id}`,
      async verify(code: string) {
        if (code !== "valid") throw new Error("Invalid identity");
        return { subject: "subject", email, emailAuthoritative: true };
      },
    },
  };
  const oidc = createOidcService(db, config, options);
  async function ready(
    service = oidc,
    session?: { userId: string; tokenId: string },
  ) {
    const proof = await service.begin(session, { initiator: "browser" });
    const launch = new URL(proof.launchUrl).searchParams.get("launch")!;
    await service.launch(proof.id, launch, "cookie", { initiator: "browser" });
    await service.callback(proof.id, "cookie", "valid");
    return proof;
  }
  return {
    db,
    oidc,
    ready,
    options,
    expire: () => {
      time += 600_001;
    },
    changeEmail: () => {
      email = "changed@example.com";
    },
    user: (id: string) =>
      selectAsync(db, { selector: getUserById, args: { id } }),
  };
}

describe("OIDC configuration", () => {
  test("is opt-in and rejects partial configuration", () => {
    expect(parseOidcConfig({})).toBeNull();
    expect(() => parseOidcConfig({ WBD_OIDC_CLIENT_ID: "tasks" })).toThrow();
    const env = {
      WBD_OIDC_ISSUER: config.issuer,
      WBD_OIDC_CLIENT_ID: config.clientId,
      WBD_OIDC_CLIENT_SECRET: config.clientSecret,
      WBD_OIDC_PUBLIC_APP_URL: config.appUrl,
    };
    expect(parseOidcConfig(env)).toMatchObject({ ...config, name: "SSO" });
    for (const url of [
      "http://tasks.example.com",
      "https://tasks.example.com/path",
      "https://user:pass@tasks.example.com",
      "https://tasks.example.com/?foo=bar",
    ]) {
      expect(() =>
        parseOidcConfig({ ...env, WBD_OIDC_PUBLIC_APP_URL: url }),
      ).toThrow();
    }
    expect(() =>
      parseOidcConfig({
        ...env,
        WBD_OIDC_ISSUER: "http://identity.example.com",
      }),
    ).toThrow();
    expect(() =>
      parseOidcConfig({
        ...env,
        WBD_OIDC_ISSUER:
          "https://identity.example.com/.well-known/openid-configuration",
      }),
    ).toThrow();
  });
});

test("creates a passwordless account, signs in by issuer and subject, and consumes proofs once", async () => {
  const f = fixture();
  const proof = await f.ready();
  const credentials = await f.oidc.completeSignIn(proof);
  expect(
    await authenticateBearerToken(`Bearer ${credentials.token}`, f.db),
  ).toMatchObject({ id: credentials.userId });
  expect(await f.user(credentials.userId)).toMatchObject({
    email: "person@example.com",
    oidcEmail: "person@example.com",
  });
  expect((await f.user(credentials.userId))?.password).toBeUndefined();
  await rejects(f.oidc.completeSignIn(proof));
  f.changeEmail();
  const next = await f.oidc.completeSignIn(await f.ready());
  expect(next.userId).toBe(credentials.userId);
  expect(await f.user(next.userId)).toMatchObject({
    email: "person@example.com",
    oidcEmail: "changed@example.com",
  });
  const other = createOidcService(
    f.db,
    { ...config, issuer: "https://other.example.com" },
    f.options,
  );
  const otherUser = await other.completeSignIn(await f.ready(other));
  expect(otherUser.userId).not.toBe(credentials.userId);
});

test("requires explicit password-confirmed linking for an existing email and permits safe disconnection", async () => {
  const f = fixture();
  const account = await asyncDispatch(
    f.db,
    register({
      email: "person@example.com",
      hashedPassword: await Bun.password.hash("test-password"),
    }),
  );
  const proof = await f.ready();
  await rejects(f.oidc.completeSignIn(proof), "already exists");
  const session = { userId: account.userId, tokenId: account.token };
  const link = await f.ready(f.oidc, session);
  await rejects(f.oidc.completeLink(link, session, "wrong-password"));
  await f.oidc.completeLink(link, session, "test-password");
  expect((await f.oidc.completeSignIn(await f.ready())).userId).toBe(
    account.userId,
  );
  const unconfigured = createAppRouter({
    mainDB: f.db,
    captchaConfig: null,
  }).createCaller({
    user: { id: account.userId, email: "person@example.com" },
    tokenId: account.token,
  });
  await unconfigured.oidc.disconnect({ password: "test-password" });
  expect((await f.user(account.userId))?.oidcIdentity).toBeUndefined();
});

test("does not disconnect the only login method", async () => {
  const f = fixture();
  const account = await f.oidc.completeSignIn(await f.ready());
  await rejects(
    f.oidc.disconnect(
      { userId: account.userId, tokenId: account.token },
      "password",
    ),
  );
});

test("binds launch and callback to the browser, rejects bad proofs, cancellation, expiry and origin changes", async () => {
  const f = fixture();
  await rejects(
    f.oidc.begin(
      undefined,
      { initiator: "browser" },
      "https://evil.example.com",
    ),
  );
  const flow = await f.oidc.begin(undefined, { initiator: "browser" });
  const launch = new URL(flow.launchUrl).searchParams.get("launch")!;
  await rejects(
    f.oidc.launch(flow.id, launch, "cookie", { initiator: "other" }),
  );
  await f.oidc.launch(flow.id, launch, "cookie", { initiator: "browser" });
  await rejects(
    f.oidc.launch(flow.id, launch, "cookie", { initiator: "browser" }),
  );
  await rejects(f.oidc.callback(flow.id, "other", "valid"));
  await f.oidc.callback(flow.id, "cookie", "valid");
  await rejects(f.oidc.callback(flow.id, "cookie", "valid"));
  await rejects(f.oidc.completeSignIn({ ...flow, secret: "other" }));
  await f.oidc.cancel(flow);
  await rejects(f.oidc.completeSignIn(flow));
  const expired = await f.ready();
  f.expire();
  await rejects(f.oidc.completeSignIn(expired));
});

test("requires the desktop loopback completion code and rechecks linking sessions", async () => {
  const f = fixture();
  const flow = await f.oidc.begin(undefined, { desktop: true });
  const launch = new URL(flow.launchUrl).searchParams.get("launch")!;
  await f.oidc.launch(flow.id, launch, "cookie", { loopbackPort: 12345 });
  const completion = await f.oidc.callback(flow.id, "cookie", "valid");
  await rejects(f.oidc.completeSignIn(flow));
  await rejects(f.oidc.completeSignIn({ ...flow, completion: "wrong" }));
  const account = await f.oidc.completeSignIn({ ...flow, completion });
  const session = { userId: account.userId, tokenId: account.token };
  const link = await f.ready(f.oidc, session);
  await asyncDispatch(
    f.db,
    revokeToken({ tokenId: account.token, userId: account.userId }),
  );
  await rejects(f.oidc.completeLink(link, session, "password"));
});

test("password signup, sign-in and email recovery remain available alongside OIDC", async () => {
  const f = fixture();
  execSync(f.db.loadTables(accountEmailTables));
  const accountEmail = createAccountEmailService(f.db, {
    apiKey: "test-only",
    from: "accounts@example.com",
    appUrl: config.appUrl,
  });
  const caller = createAppRouter({
    mainDB: f.db,
    captchaConfig: null,
    oidc: f.oidc,
    accountEmail,
  }).createCaller({ user: null });
  expect(await caller.getAuthConfig()).toEqual({
    emailEnabled: true,
    oidcName: config.name,
    googleEnabled: false,
  });
  const credentials = {
    email: "password-user@example.com",
    password: "test-password",
  };
  const account = await caller.register(credentials);
  expect((await caller.login(credentials)).userId).toBe(account.userId);
  expect(
    await caller.requestPasswordReset({ email: credentials.email }),
  ).toEqual({ success: true });
  const sso = await f.oidc.completeSignIn(await f.ready());
  expect(sso.userId).not.toBe(account.userId);
});

test("OIDC routes bind cookies and complete sign-in over HTTP through the typed client", async () => {
  const f = fixture();
  const appRouter = createAppRouter({
    mainDB: f.db,
    captchaConfig: null,
    oidc: f.oidc,
  });
  const server = createServer({
    appRouter,
    mainDB: f.db,
    oidc: f.oidc,
    serveFrontend: false,
    logger: false,
    rateLimit: { enabled: false, backend: "memory" },
  });
  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const client = createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: `${server.listeningOrigin}/api/trpc` })],
    });
    const begun = await server.inject({
      method: "POST",
      url: "/api/trpc/oidc.beginSignIn",
      payload: {},
    });
    expect(begun.statusCode).toBe(200);
    const flow = begun.json<{
      result: { data: Awaited<ReturnType<typeof f.oidc.begin>> };
    }>().result.data;
    expect(begun.headers["set-cookie"]).toContain(`wbd_oidc_${flow.id}=`);
    expect(begun.headers["set-cookie"]).toContain("Path=/api/auth/oidc;");
    const launchUrl = new URL(flow.launchUrl);
    const path = launchUrl.pathname + launchUrl.search;
    expect((await server.inject({ url: path })).statusCode).toBe(400);
    const launch = await server.inject({
      url: path,
      headers: { cookie: String(begun.headers["set-cookie"]).split(";")[0] },
    });
    expect(launch.statusCode).toBe(302);
    const callbackUrl = `/api/auth/oidc/callback?state=${flow.id}&code=valid&iss=${encodeURIComponent(config.issuer)}`;
    expect((await server.inject({ url: callbackUrl })).statusCode).toBe(400);
    const callback = await server.inject({
      url: callbackUrl,
      headers: { cookie: String(launch.headers["set-cookie"]).split(";")[0] },
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.body).toContain(`wbd-oidc-${flow.id}`);
    expect(callback.headers["cache-control"]).toBe("no-store");
    const credentials = await client.oidc.completeSignIn.mutate(flow);
    expect(
      await authenticateBearerToken(`Bearer ${credentials.token}`, f.db),
    ).toMatchObject({ id: credentials.userId });
    await rejects(client.oidc.completeSignIn.mutate(flow));
  } finally {
    await server.close();
  }
});
