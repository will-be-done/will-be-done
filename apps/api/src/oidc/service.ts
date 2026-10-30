import { randomBytes } from "node:crypto";
import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import type { OidcConfig } from "./config";
import { resolveOidcAppUrl } from "./config";
import type { OidcFlow } from "./tables";
import type { OidcProvider } from "./provider";
import { createOidcProvider } from "./provider";
import {
  cancelFlow,
  findFlow,
  flowError,
  claimCallback,
  completeOidcFlow,
  disconnectOidc,
  finishCallback,
  hashSecret,
  insertFlow,
  launchFlow,
  readFlowStatus,
} from "./actions";
import { getUserById } from "../slices/authSlice";
import type { BackendAnalytics } from "../analytics";
import { noopBackendAnalytics } from "../analytics";

const randomSecret = () => randomBytes(32).toString("base64url");
export interface OidcProof {
  id: string;
  secret: string;
  completion?: string;
}
export interface OidcSession {
  userId: string;
  tokenId: string;
}

async function confirmPassword(db: DB, session: OidcSession, password: string) {
  const user = await selectAsync(db, {
    selector: getUserById,
    args: { id: session.userId },
  });
  if (!user?.password || !(await Bun.password.verify(password, user.password)))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Incorrect password. Use email password recovery if you need to set one.",
    });
  return user.password;
}

export async function disconnectOidcAccount(
  db: DB,
  session: OidcSession,
  password: string,
  analytics: BackendAnalytics = noopBackendAnalytics,
  now = Date.now(),
) {
  const expectedPassword = await confirmPassword(db, session, password);
  const result = await asyncDispatch(
    db,
    disconnectOidc({ ...session, expectedPassword, now }),
  );
  analytics.capture({
    name: "oidc_disconnected",
    distinctId: session.userId,
  });
  return result;
}

export function createOidcService(
  db: DB,
  config: OidcConfig,
  {
    provider = createOidcProvider(config),
    now = Date.now,
    analytics = noopBackendAnalytics,
  }: {
    provider?: OidcProvider;
    now?: () => number;
    analytics?: BackendAnalytics;
  } = {},
) {
  async function begin(
    session: OidcSession | undefined,
    binding: { initiator: string } | { desktop: true },
    origin?: string,
  ) {
    let appUrl: string;
    try {
      appUrl = resolveOidcAppUrl(config, origin);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported SSO sign-in origin",
      });
    }
    const id = randomSecret(),
      secret = randomSecret(),
      launch = randomSecret();
    const flow: OidcFlow = {
      id,
      appUrl,
      issuer: config.issuer,
      clientId: config.clientId,
      secretHash: hashSecret(secret),
      launchHash: hashSecret(launch),
      ...("initiator" in binding
        ? { initiatorHash: hashSecret(binding.initiator) }
        : {}),
      nonce: randomSecret(),
      pkceVerifier: randomSecret(),
      status: "pending",
      intent: session ? "link" : "signin",
      ...(session ?? {}),
      expiresAt: now() + 600_000,
    };
    await asyncDispatch(db, insertFlow({ flow, now: now() }));
    return {
      id,
      secret,
      launchUrl: `${appUrl}/api/auth/oidc/launch?id=${id}&launch=${launch}`,
      expiresAt: flow.expiresAt,
    };
  }

  async function assertProvider(id: string) {
    const flow = await selectAsync(db, { selector: findFlow, args: { id } });
    if (
      !flow ||
      flow.issuer !== config.issuer ||
      flow.clientId !== config.clientId ||
      flow.appUrl !== config.appUrl
    )
      throw flowError();
  }

  return {
    appUrl: config.appUrl,
    name: config.name,
    begin,
    async returnTarget(id: string) {
      await assertProvider(id);
      const flow = await selectAsync(db, { selector: findFlow, args: { id } });
      if (!flow) throw flowError();
      return {
        appUrl: resolveOidcAppUrl(config, flow.appUrl),
        loopbackPort: flow.loopbackPort,
      };
    },
    async launch(
      id: string,
      launch: string,
      cookie: string,
      binding: { initiator?: string; loopbackPort?: number },
    ) {
      await assertProvider(id);
      const flow = await asyncDispatch(
        db,
        launchFlow({ id, launch, cookie, ...binding, now: now() }),
      );
      return provider.authorizationUrl(flow);
    },
    async callback(
      id: string,
      cookie: string,
      code?: string,
      denied = false,
      issuer?: string,
    ) {
      await assertProvider(id);
      const flow = await asyncDispatch(
        db,
        claimCallback({ id, cookie, now: now() }),
      );
      try {
        if (denied || !code) throw new Error("Denied");
        const profile = await provider.verify(code, flow, issuer);
        const completion =
          flow.loopbackPort === undefined ? undefined : randomSecret();
        await asyncDispatch(
          db,
          finishCallback({ id, profile, completion, now: now() }),
        );
        return completion;
      } catch {
        await asyncDispatch(
          db,
          finishCallback({
            id,
            now: now(),
            error: denied
              ? "SSO sign-in was cancelled. Please try again."
              : "SSO sign-in failed. Please try again.",
          }),
        );
        return undefined;
      }
    },
    poll: async (proof: OidcProof) => {
      await assertProvider(proof.id);
      return selectAsync(db, {
        selector: readFlowStatus,
        args: { ...proof, now: now() },
      });
    },
    cancel: async (proof: OidcProof) => {
      await assertProvider(proof.id);
      return asyncDispatch(db, cancelFlow(proof));
    },
    async completeSignIn(proof: OidcProof) {
      await assertProvider(proof.id);
      const result = await asyncDispatch(
        db,
        completeOidcFlow({
          ...proof,
          intent: "signin",
          now: now(),
        }),
      );
      if (!result.token) throw new Error("Missing sign-in token");
      analytics.capture(
        result.created
          ? {
              name: "user_signed_up",
              distinctId: result.userId,
              properties: { captcha_enabled: false, auth_method: "oidc" },
            }
          : {
              name: "login_succeeded",
              distinctId: result.userId,
              properties: { auth_method: "oidc" },
            },
      );
      return { userId: result.userId, token: result.token };
    },
    async completeLink(
      proof: OidcProof,
      session: OidcSession,
      password: string,
    ) {
      await assertProvider(proof.id);
      const expectedPassword = await confirmPassword(db, session, password);
      await asyncDispatch(
        db,
        completeOidcFlow({
          ...proof,
          ...session,
          intent: "link",
          expectedPassword,
          now: now(),
        }),
      );
      analytics.capture({
        name: "oidc_connected",
        distinctId: session.userId,
      });
      return { success: true as const };
    },
    disconnect: (session: OidcSession, password: string) =>
      disconnectOidcAccount(db, session, password, analytics, now()),
  };
}
export type OidcService = ReturnType<typeof createOidcService>;
export function requireOidc(service?: OidcService) {
  if (!service)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "SSO sign-in is not configured on this server.",
    });
  return service;
}
