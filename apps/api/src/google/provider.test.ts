import { afterEach, expect, spyOn, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client, type GetTokenOptions } from "google-auth-library";
import {
  CertificateFormat,
  type GetTokenResponse,
} from "google-auth-library/build/src/auth/oauth2client";
import { createGoogleProvider } from "./provider";
import type { GoogleFlow } from "./tables";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const config = {
  clientId: "client",
  clientSecret: "secret",
  appUrl: "https://app.example.com",
};
const flow: GoogleFlow = {
  id: "state",
  secretHash: "hash",
  status: "launched",
  intent: "signin",
  nonce: "nonce",
  pkceVerifier: "v".repeat(43),
  expiresAt: Date.now() + 600_000,
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const restore of cleanup.splice(0)) restore();
});

function signedToken(changes: Record<string, unknown> = {}, corrupt = false) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "key" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "client",
      sub: "subject",
      email: "person@gmail.com",
      email_verified: true,
      nonce: "nonce",
      iat: now,
      exp: now + 3600,
      ...changes,
    }),
  ).toString("base64url");
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${header}.${payload}`),
    keys.privateKey,
  ).toString("base64url");
  return `${header}.${payload}.${corrupt ? "invalid" : signature}`;
}
function providerToken(token: string) {
  const prototype = OAuth2Client.prototype as {
    getToken(options: GetTokenOptions): Promise<GetTokenResponse>;
  };
  const exchange = spyOn(prototype, "getToken").mockResolvedValue({
    tokens: { id_token: token },
    res: null,
  });
  const certs = spyOn(
    OAuth2Client.prototype,
    "getFederatedSignonCertsAsync",
  ).mockResolvedValue({
    certs: { key: publicKey },
    format: CertificateFormat.PEM,
  });
  cleanup.push(() => {
    exchange.mockRestore();
    certs.mockRestore();
  });
  return createGoogleProvider(config);
}

async function rejects(promise: Promise<unknown>) {
  let error: unknown;
  try {
    await promise;
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(Error);
}

test("provider requests minimal scopes, PKCE, nonce, and the configured callback", () => {
  const url = new URL(createGoogleProvider(config).authorizationUrl(flow));
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("scope")).toBe("openid email");
  expect(url.searchParams.get("nonce")).toBe(flow.nonce!);
  expect(url.searchParams.get("state")).toBe(flow.id);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://app.example.com/api/auth/google/callback",
  );
  expect(url.searchParams.has("access_type")).toBe(false);
});

test("valid signed Google claims produce a stable identity", async () => {
  expect(await providerToken(signedToken()).verify("code", flow)).toEqual({
    subject: "subject",
    email: "person@gmail.com",
    emailAuthoritative: true,
  });
});
for (const [label, claims] of [
  ["wrong audience", { aud: "evil-client" }],
  ["wrong issuer", { iss: "https://evil.example.com" }],
  ["expired", { exp: Math.floor(Date.now() / 1000) - 600 }],
  ["wrong nonce", { nonce: "other" }],
  ["missing nonce", { nonce: undefined }],
  ["missing subject", { sub: undefined }],
  ["unverified email", { email_verified: false }],
  ["invalid email", { email: "invalid" }],
] as const) {
  test(`rejects ${label}`, async () => {
    await rejects(providerToken(signedToken(claims)).verify("code", flow));
  });
}
test("rejects a corrupted signature", async () => {
  await rejects(providerToken(signedToken({}, true)).verify("code", flow));
});
test("rejects a malformed JWT", async () => {
  await rejects(providerToken("not-a-jwt").verify("code", flow));
});
test("third-party email requires app verification", async () => {
  expect(
    (
      await providerToken(signedToken({ email: "person@example.com" })).verify(
        "code",
        flow,
      )
    ).emailAuthoritative,
  ).toBe(false);
});
test("verified Workspace email is authoritative", async () => {
  expect(
    (
      await providerToken(
        signedToken({ email: "person@example.com", hd: "example.com" }),
      ).verify("code", flow)
    ).emailAuthoritative,
  ).toBe(true);
});
