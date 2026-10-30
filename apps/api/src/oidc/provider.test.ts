import { afterEach, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { createOidcProvider } from "./provider";
import type { OidcFlow } from "./tables";

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

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: "jwk" }),
  kid: "key",
  alg: "RS256",
  use: "sig",
};
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function fixture(
  changes: Record<string, unknown> = {},
  corrupt = false,
  userInfoSubject = "subject",
) {
  let tokenRequest = new URLSearchParams();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const issuer = url.origin;
      if (url.pathname === "/.well-known/openid-configuration")
        return Response.json({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          userinfo_endpoint: `${issuer}/userinfo`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          authorization_response_iss_parameter_supported: true,
        });
      if (url.pathname === "/jwks") return Response.json({ keys: [jwk] });
      if (url.pathname === "/userinfo")
        return Response.json({
          sub: userInfoSubject,
          email: "person@example.com",
          email_verified: true,
        });
      if (url.pathname === "/token") {
        tokenRequest = new URLSearchParams(await request.text());
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(
          JSON.stringify({ alg: "RS256", kid: "key" }),
        ).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            iss: issuer,
            aud: "client",
            sub: "subject",
            iat: now,
            exp: now + 3600,
            nonce: "nonce",
            email: "person@example.com",
            email_verified: true,
            ...changes,
          }),
        ).toString("base64url");
        const signature = sign(
          "RSA-SHA256",
          Buffer.from(`${header}.${payload}`),
          keys.privateKey,
        ).toString("base64url");
        return Response.json({
          access_token: "access-token",
          token_type: "Bearer",
          id_token: `${header}.${payload}.${corrupt ? "invalid" : signature}`,
        });
      }
      return new Response(null, { status: 404 });
    },
  });
  cleanup.push(() => server.stop(true));
  const config = {
    issuer: server.url.origin,
    clientId: "client",
    clientSecret: "secret",
    appUrl: "https://app.example.com",
    name: "SSO",
  };
  const flow: OidcFlow = {
    id: "state",
    issuer: config.issuer,
    clientId: config.clientId,
    secretHash: "hash",
    status: "launched",
    intent: "signin",
    nonce: "nonce",
    pkceVerifier: "v".repeat(43),
    expiresAt: Date.now() + 600_000,
  };
  const provider = createOidcProvider(config);
  return {
    config,
    flow,
    provider,
    request: () => tokenRequest,
    verify: () => provider.verify("code", flow, config.issuer),
  };
}

test("discovers the provider, requests PKCE and nonce, and verifies signed identity tokens", async () => {
  const f = fixture();
  const url = new URL(await f.provider.authorizationUrl(f.flow));
  expect(url.searchParams.get("scope")).toBe("openid email");
  expect(url.searchParams.get("state")).toBe("state");
  expect(url.searchParams.get("nonce")).toBe("nonce");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://app.example.com/api/auth/oidc/callback",
  );
  expect(await f.verify()).toEqual({
    subject: "subject",
    email: "person@example.com",
    emailAuthoritative: true,
  });
  expect(f.request().get("code_verifier")).toBe(f.flow.pkceVerifier!);
  expect(f.request().get("client_secret")).toBe("secret");
});

for (const [label, claims] of [
  ["wrong issuer", { iss: "https://evil.example.com" }],
  ["wrong audience", { aud: "other" }],
  ["expired token", { exp: 1 }],
  ["wrong nonce", { nonce: "other" }],
  ["missing nonce", { nonce: undefined }],
  ["empty subject", { sub: "" }],
  ["unverified email", { email_verified: false }],
  ["missing email verification", { email_verified: undefined }],
  ["invalid email", { email: "invalid" }],
] as const) {
  test(`rejects ${label}`, async () => {
    await rejects(fixture(claims).verify());
  });
}
test("rejects a corrupted signature and an authorization response from another issuer", async () => {
  await rejects(fixture({}, true).verify());
  const f = fixture();
  await rejects(f.provider.verify("code", f.flow, "https://evil.example.com"));
});
test("reads email from UserInfo only for the authenticated subject", async () => {
  expect(
    await fixture({ email: undefined, email_verified: undefined }).verify(),
  ).toMatchObject({ email: "person@example.com" });
  await rejects(fixture({ email: undefined }, false, "other").verify());
});
