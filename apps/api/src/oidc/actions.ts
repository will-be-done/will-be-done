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
import { oidcFlowsTable, type OidcFlow, type OidcProfile } from "./tables";

export const hashSecret = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const flowError = () =>
  new TRPCError({
    code: "BAD_REQUEST",
    message:
      "This SSO sign-in has expired or is no longer valid. Please try again.",
  });
export const findFlow = selector({
  name: "findOidcFlow",
  args: { id: v.string() },
  handler: function* ({ id }) {
    return yield* selectFrom(oidcFlowsTable, "byId")
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
  name: "insertOidcFlow",
  args: { flow: v.pass<OidcFlow>(), now: v.number() },
  handler: function* ({ flow, now }) {
    const expired = yield* selectFrom(oidcFlowsTable, "byExpiresAt")
      .where((q) => q.lte("expiresAt", now))
      .limit(100);
    if (expired.length)
      yield* deleteRows(
        oidcFlowsTable,
        expired.map((row) => row.id),
      );
    yield* insert(oidcFlowsTable, [flow]);
  },
});

export const readLaunch = selector({
  name: "readOidcLaunch",
  args: { id: v.string(), launch: v.string(), now: v.number() },
  handler: function* ({ id, launch, now }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "pending" || flow.launchHash !== hashSecret(launch))
      throw flowError();
    return flow;
  },
});

export const launchFlow = action({
  name: "launchOidcFlow",
  args: {
    id: v.string(),
    launch: v.string(),
    cookie: v.string(),
    initiator: v.optional(v.string()),
    loopbackPort: v.optional(v.number()),
    now: v.number(),
  },
  handler: function* ({ id, launch, cookie, initiator, loopbackPort, now }) {
    const flow = yield* readLaunch({ id, launch, now });
    if (
      flow.initiatorHash
        ? !initiator || flow.initiatorHash !== hashSecret(initiator)
        : loopbackPort === undefined
    )
      throw flowError();
    const { launchHash: _launch, initiatorHash: _initiator, ...rest } = flow;
    yield* upsert(oidcFlowsTable, [
      {
        ...rest,
        cookieHash: hashSecret(cookie),
        status: "launched",
        ...(flow.initiatorHash ? {} : { loopbackPort }),
      },
    ]);
    return flow;
  },
});

export const claimCallback = action({
  name: "claimOidcCallback",
  args: { id: v.string(), cookie: v.string(), now: v.number() },
  handler: function* ({ id, cookie, now }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "launched" || flow.cookieHash !== hashSecret(cookie))
      throw flowError();
    yield* upsert(oidcFlowsTable, [{ ...flow, status: "exchanging" }]);
    return flow;
  },
});

export const finishCallback = action({
  name: "finishOidcCallback",
  args: {
    id: v.string(),
    now: v.number(),
    profile: v.optional(v.pass<OidcProfile>()),
    completion: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: function* ({ id, now, profile, completion, error }) {
    const flow = yield* requireFlow(id, now);
    if (flow.status !== "exchanging") throw flowError();
    const {
      pkceVerifier: _pkce,
      nonce: _nonce,
      cookieHash: _cookie,
      ...rest
    } = flow;
    yield* upsert(oidcFlowsTable, [
      {
        ...rest,
        status: profile ? "ready" : "error",
        ...(profile
          ? {
              oidcSubject: profile.subject,
              oidcEmail: profile.email,
              emailAuthoritative: profile.emailAuthoritative,
              ...(completion ? { completionHash: hashSecret(completion) } : {}),
            }
          : { error: error ?? "SSO sign-in failed. Please try again." }),
      },
    ]);
  },
});

// Desktop flows finish only with the code the Oidc callback sent to the
// loopback address of the machine that completed sign-in. Whoever started the
// flow cannot see its result without that code.
const completed = (flow: OidcFlow, completion?: string) =>
  flow.loopbackPort === undefined ||
  (!!completion &&
    !!flow.completionHash &&
    flow.completionHash === hashSecret(completion));

export const readFlowStatus = selector({
  name: "readOidcFlowStatus",
  args: {
    id: v.string(),
    secret: v.string(),
    completion: v.optional(v.string()),
    now: v.number(),
  },
  handler: function* ({ id, secret, completion, now }) {
    const flow = yield* requireFlow(id, now, secret);
    const ready = flow.status === "ready" && completed(flow, completion);
    return {
      status: ready
        ? ("ready" as const)
        : flow.status === "error"
          ? ("error" as const)
          : ("pending" as const),
      email: ready && flow.intent === "link" ? (flow.oidcEmail ?? null) : null,
      error: flow.error ?? null,
    };
  },
});

export const cancelFlow = action({
  name: "cancelOidcFlow",
  args: { id: v.string(), secret: v.string() },
  handler: function* ({ id, secret }) {
    const flow = yield* findFlow({ id });
    if (flow?.secretHash === hashSecret(secret))
      yield* deleteRows(oidcFlowsTable, [id]);
    return { success: true as const };
  },
});

function* userByOidcSubject(subject: string) {
  return yield* selectFrom(usersTable, "byOidcIdentity")
    .where((q) => q.eq("oidcIdentity", subject))
    .first();
}

export const completeOidcFlow = action({
  name: "completeOidcFlow",
  args: {
    id: v.string(),
    secret: v.string(),
    completion: v.optional(v.string()),
    now: v.number(),
    intent: v.union(v.literal("signin"), v.literal("link")),
    userId: v.optional(v.string()),
    tokenId: v.optional(v.string()),
    expectedPassword: v.optional(v.string()),
  },
  handler: function* ({
    id,
    secret,
    completion,
    now,
    intent,
    userId,
    tokenId,
    expectedPassword,
  }) {
    const flow = yield* requireFlow(id, now, secret);
    if (
      flow.status !== "ready" ||
      !completed(flow, completion) ||
      flow.intent !== intent ||
      !flow.oidcSubject ||
      !flow.oidcEmail
    )
      throw flowError();
    const identity = hashSecret(
      JSON.stringify([flow.issuer, flow.oidcSubject]),
    );
    const owner = yield* userByOidcSubject(identity);
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
          message: "Confirm your current password to connect SSO.",
        });
      if (owner && owner.id !== userId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This SSO account is already connected to another user.",
        });
      if (current.oidcIdentity && current.oidcIdentity !== identity)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Disconnect your current SSO account before connecting another.",
        });
      user = {
        ...current,
        oidcIdentity: identity,
        oidcEmail: flow.oidcEmail,
        ...(normalizeEmail(current.email) === normalizeEmail(flow.oidcEmail)
          ? { emailVerifiedAt: timestamp }
          : {}),
        updatedAt: timestamp,
      };
      yield* upsert(usersTable, [user]);
    } else if (owner) {
      user = { ...owner, oidcEmail: flow.oidcEmail, updatedAt: timestamp };
      yield* upsert(usersTable, [user]);
    } else {
      if (yield* getUserByNormalizedEmail({ email: flow.oidcEmail }))
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An account with this email already exists. Sign in with your existing method, then connect SSO in Account settings.",
        });
      user = {
        id: uuidv7(),
        email: normalizeEmail(flow.oidcEmail),
        normalizedEmail: normalizeEmail(flow.oidcEmail),
        oidcIdentity: identity,
        oidcEmail: flow.oidcEmail,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(flow.emailAuthoritative ? { emailVerifiedAt: timestamp } : {}),
      };
      yield* insert(usersTable, [user]);
      created = true;
    }
    yield* deleteRows(oidcFlowsTable, [id]);
    if (intent === "link")
      return { userId: user.id, token: null, created: false };
    const token = yield* generateToken({ userId: user.id });
    return { userId: user.id, token: token.token, created };
  },
});

export const disconnectOidc = action({
  name: "disconnectOidc",
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
        message: "Confirm your email and password before disconnecting SSO.",
      });
    const { oidcIdentity: _identity, oidcEmail: _email, ...rest } = user;
    yield* upsert(usersTable, [
      { ...rest, updatedAt: new Date(now).toISOString() },
    ]);
    return { success: true as const };
  },
});
