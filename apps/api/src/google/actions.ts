import { createHash } from "node:crypto";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import {
  generateToken,
  getTokenById,
  getUserById,
  getUserByNormalizedEmail,
  normalizeEmail,
} from "../slices/authSlice";
import { usersTable, type User } from "../slices/tables";
import { enqueueGoogleAccountEmail } from "../email/actions";
import type { EmailTemplateConfig } from "../email/config";
import {
  googleFlowsTable,
  type GoogleFlow,
  type GoogleProfile,
} from "./tables";

export const hashSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const flowError = () =>
  new TRPCError({
    code: "BAD_REQUEST",
    message:
      "This Google sign-in has expired or is no longer valid. Please try again.",
  });
export const findFlow = selector({
  name: "findGoogleFlow",
  args: { id: v.string() },
  handler: function* ({ id }) {
    return yield* selectFrom(googleFlowsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
  },
});

export function* requireFlow(id: string, now: number, secret?: string) {
  const flow = yield* findFlow({ id });
  if (
    !flow ||
    flow.expiresAt <= now ||
    (secret !== undefined && hashSecret(secret) !== flow.secretHash)
  )
    throw flowError();
  return flow;
}

export const insertFlow = action({
  name: "insertGoogleFlow",
  args: { flow: v.pass<GoogleFlow>(), now: v.number() },
  handler: function* ({ flow, now }) {
    const expired = yield* selectFrom(googleFlowsTable, "byExpiresAt")
      .where((q) => q.lte("expiresAt", now))
      .limit(100);
    if (expired.length)
      yield* deleteRows(
        googleFlowsTable,
        expired.map((row) => row.id),
      );
    yield* insert(googleFlowsTable, [flow]);
  },
});

export const launchFlow = action({
  name: "launchGoogleFlow",
  args: {
    id: v.string(),
    launch: v.string(),
    cookie: v.string(),
    now: v.number(),
  },
  handler: function* ({ id, launch, cookie, now }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "pending" || flow.launchHash !== hashSecret(launch))
      throw flowError();
    const { launchHash: _launch, ...rest } = flow;
    yield* upsert(googleFlowsTable, [
      { ...rest, cookieHash: hashSecret(cookie), status: "launched" },
    ]);
    return flow;
  },
});

export const claimCallback = action({
  name: "claimGoogleCallback",
  args: { id: v.string(), cookie: v.string(), now: v.number() },
  handler: function* ({ id, cookie, now }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "launched" || flow.cookieHash !== hashSecret(cookie))
      throw flowError();
    yield* upsert(googleFlowsTable, [{ ...flow, status: "exchanging" }]);
    return flow;
  },
});

export const finishCallback = action({
  name: "finishGoogleCallback",
  args: {
    id: v.string(),
    now: v.number(),
    profile: v.optional(v.pass<GoogleProfile>()),
    error: v.optional(v.string()),
  },
  handler: function* ({ id, now, profile, error }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "exchanging") throw flowError();
    const {
      pkceVerifier: _pkce,
      nonce: _nonce,
      cookieHash: _cookie,
      ...rest
    } = flow;
    yield* upsert(googleFlowsTable, [
      {
        ...rest,
        status: profile ? "ready" : "error",
        ...(profile
          ? {
              googleSubject: profile.subject,
              googleEmail: profile.email,
              emailAuthoritative: profile.emailAuthoritative,
            }
          : { error: error ?? "Google sign-in failed. Please try again." }),
      },
    ]);
  },
});

export const readFlowStatus = selector({
  name: "readGoogleFlowStatus",
  args: { id: v.string(), secret: v.string(), now: v.number() },
  handler: function* ({ id, secret, now }) {
    const flow = yield* requireFlow(id, now, secret);
    return {
      status:
        flow.status === "ready"
          ? ("ready" as const)
          : flow.status === "error"
            ? ("error" as const)
            : ("pending" as const),
      email: flow.googleEmail ?? null,
      error: flow.error ?? null,
    };
  },
});

export const cancelFlow = action({
  name: "cancelGoogleFlow",
  args: { id: v.string(), secret: v.string() },
  handler: function* ({ id, secret }) {
    const flow = yield* findFlow({ id });
    if (flow?.secretHash === hashSecret(secret))
      yield* deleteRows(googleFlowsTable, [id]);
    return { success: true as const };
  },
});

function* userByGoogleSubject(subject: string) {
  return yield* selectFrom(usersTable, "byGoogleSubject")
    .where((q) => q.eq("googleSubject", subject))
    .first();
}

export const completeGoogleFlow = action({
  name: "completeGoogleFlow",
  args: {
    id: v.string(),
    secret: v.string(),
    now: v.number(),
    intent: v.union(v.literal("signin"), v.literal("link")),
    userId: v.optional(v.string()),
    tokenId: v.optional(v.string()),
    expectedPassword: v.optional(v.string()),
    emailConfig: v.optional(v.pass<EmailTemplateConfig>()),
  },
  handler: function* ({
    id,
    secret,
    now,
    intent,
    userId,
    tokenId,
    expectedPassword,
    emailConfig,
  }) {
    const flow = yield* requireFlow(id, now, secret);
    if (
      flow.status !== "ready" ||
      flow.intent !== intent ||
      !flow.googleSubject ||
      !flow.googleEmail
    )
      throw flowError();
    const owner = yield* userByGoogleSubject(flow.googleSubject);
    const timestamp = new Date(now).toISOString();
    let user: User;
    let created = false;
    if (intent === "link") {
      const current = userId ? yield* getUserById({ id: userId }) : undefined;
      const session = tokenId
        ? yield* getTokenById({ id: tokenId })
        : undefined;
      if (
        !current ||
        flow.userId !== userId ||
        flow.tokenId !== tokenId ||
        session?.userId !== userId
      )
        throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!expectedPassword || current.password !== expectedPassword)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirm your current password to connect Google.",
        });
      if (owner && owner.id !== userId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This Google account is already connected to another user.",
        });
      if (current.googleSubject && current.googleSubject !== flow.googleSubject)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Disconnect your current Google account before connecting another.",
        });
      user = {
        ...current,
        googleSubject: flow.googleSubject,
        googleEmail: flow.googleEmail,
        updatedAt: timestamp,
      };
      yield* upsert(usersTable, [user]);
    } else if (owner) {
      user = { ...owner, googleEmail: flow.googleEmail, updatedAt: timestamp };
      yield* upsert(usersTable, [user]);
    } else {
      if (yield* getUserByNormalizedEmail({ email: flow.googleEmail }))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An account with this email already exists. Sign in with your existing method, then connect Google in Account settings.",
        });
      user = {
        id: uuidv7(),
        email: normalizeEmail(flow.googleEmail),
        normalizedEmail: normalizeEmail(flow.googleEmail),
        googleSubject: flow.googleSubject,
        googleEmail: flow.googleEmail,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(flow.emailAuthoritative ? { emailVerifiedAt: timestamp } : {}),
      };
      yield* insert(usersTable, [user]);
      created = true;
      if (emailConfig) yield* enqueueGoogleAccountEmail(emailConfig, user, now);
    }
    yield* deleteRows(googleFlowsTable, [id]);
    if (intent === "link")
      return { userId: user.id, token: null, created: false };
    const token = yield* generateToken({ userId: user.id });
    return { userId: user.id, token: token.token, created };
  },
});

export const disconnectGoogle = action({
  name: "disconnectGoogle",
  args: {
    userId: v.string(),
    tokenId: v.string(),
    expectedPassword: v.string(),
    now: v.number(),
  },
  handler: function* ({ userId, tokenId, expectedPassword, now }) {
    const user = yield* getUserById({ id: userId });
    const token = yield* getTokenById({ id: tokenId });
    if (!user || token?.userId !== userId)
      throw new TRPCError({ code: "UNAUTHORIZED" });
    if (
      !user.password ||
      user.password !== expectedPassword ||
      !user.emailVerifiedAt
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Confirm your email and password before disconnecting Google.",
      });
    const { googleSubject: _subject, googleEmail: _email, ...rest } = user;
    yield* upsert(usersTable, [
      { ...rest, updatedAt: new Date(now).toISOString() },
    ]);
    return { success: true as const };
  },
});
