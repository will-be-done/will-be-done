import { randomBytes } from "node:crypto";
import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import type { GoogleConfig } from "./config";
import { resolveGoogleAppUrl } from "./config";
import type { GoogleFlow } from "./tables";
import type { GoogleProvider } from "./provider";
import { createGoogleProvider } from "./provider";
import {
  cancelFlow,
  findFlow,
  flowError,
  claimCallback,
  completeGoogleFlow,
  disconnectGoogle,
  finishCallback,
  hashSecret,
  insertFlow,
  launchFlow,
  readFlowStatus,
} from "./actions";
import { getUserById } from "../slices/authSlice";
import type { BackendAnalytics } from "../analytics";
import { noopBackendAnalytics } from "../analytics";
import type { EmailTemplateConfig } from "../email/config";

const randomSecret = () => randomBytes(32).toString("base64url");
export interface GoogleProof {
  id: string;
  secret: string;
  completion?: string;
}
export interface GoogleSession {
  userId: string;
  tokenId: string;
}

async function confirmPassword(
  db: DB,
  session: GoogleSession,
  password: string,
) {
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

export async function disconnectGoogleAccount(
  db: DB,
  session: GoogleSession,
  password: string,
  analytics: BackendAnalytics = noopBackendAnalytics,
  now = Date.now(),
) {
  const expectedPassword = await confirmPassword(db, session, password);
  const result = await asyncDispatch(
    db,
    disconnectGoogle({ ...session, expectedPassword, now }),
  );
  analytics.capture({
    name: "google_disconnected",
    distinctId: session.userId,
  });
  return result;
}

export function createGoogleService(
  db: DB,
  config: GoogleConfig,
  {
    provider = createGoogleProvider(config),
    now = Date.now,
    analytics = noopBackendAnalytics,
    emailConfig,
  }: {
    provider?: GoogleProvider;
    now?: () => number;
    analytics?: BackendAnalytics;
    emailConfig?: EmailTemplateConfig;
  } = {},
) {
  async function begin(
    session: GoogleSession | undefined,
    binding: { initiator: string } | { desktop: true },
    origin?: string,
  ) {
    let appUrl: string;
    try {
      appUrl = resolveGoogleAppUrl(config, origin);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported Google sign-in origin",
      });
    }
    const id = randomSecret(),
      secret = randomSecret(),
      launch = randomSecret();
    const flow: GoogleFlow = {
      id,
      appUrl,
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
      launchUrl: `${appUrl}/api/auth/google/launch?id=${id}&launch=${launch}`,
      expiresAt: flow.expiresAt,
    };
  }

  return {
    appUrl: config.appUrl,
    begin,
    async returnTarget(id: string) {
      const flow = await selectAsync(db, { selector: findFlow, args: { id } });
      if (!flow) throw flowError();
      return {
        appUrl: resolveGoogleAppUrl(config, flow.appUrl),
        loopbackPort: flow.loopbackPort,
      };
    },
    async launch(
      id: string,
      launch: string,
      cookie: string,
      binding: { initiator?: string; loopbackPort?: number },
    ) {
      const flow = await asyncDispatch(
        db,
        launchFlow({ id, launch, cookie, ...binding, now: now() }),
      );
      return provider.authorizationUrl(flow);
    },
    async callback(id: string, cookie: string, code?: string, denied = false) {
      const flow = await asyncDispatch(
        db,
        claimCallback({ id, cookie, now: now() }),
      );
      try {
        if (denied || !code) throw new Error("Denied");
        const profile = await provider.verify(code, flow);
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
              ? "Google sign-in was cancelled. Please try again."
              : "Google sign-in failed. Please try again.",
          }),
        );
        return undefined;
      }
    },
    poll: (proof: GoogleProof) =>
      selectAsync(db, {
        selector: readFlowStatus,
        args: { ...proof, now: now() },
      }),
    cancel: (proof: GoogleProof) => asyncDispatch(db, cancelFlow(proof)),
    async completeSignIn(proof: GoogleProof) {
      const result = await asyncDispatch(
        db,
        completeGoogleFlow({
          ...proof,
          intent: "signin",
          now: now(),
          emailConfig,
        }),
      );
      if (!result.token) throw new Error("Missing sign-in token");
      analytics.capture(
        result.created
          ? {
              name: "user_signed_up",
              distinctId: result.userId,
              properties: { captcha_enabled: false, auth_method: "google" },
            }
          : {
              name: "login_succeeded",
              distinctId: result.userId,
              properties: { auth_method: "google" },
            },
      );
      return { userId: result.userId, token: result.token };
    },
    async completeLink(
      proof: GoogleProof,
      session: GoogleSession,
      password: string,
    ) {
      const expectedPassword = await confirmPassword(db, session, password);
      await asyncDispatch(
        db,
        completeGoogleFlow({
          ...proof,
          ...session,
          intent: "link",
          expectedPassword,
          now: now(),
        }),
      );
      analytics.capture({
        name: "google_connected",
        distinctId: session.userId,
      });
      return { success: true as const };
    },
    disconnect: (session: GoogleSession, password: string) =>
      disconnectGoogleAccount(db, session, password, analytics, now()),
  };
}
export type GoogleService = ReturnType<typeof createGoogleService>;
export function requireGoogle(service?: GoogleService) {
  if (!service)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google sign-in is not configured on this server.",
    });
  return service;
}
