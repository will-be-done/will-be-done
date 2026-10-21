import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { TRPCError } from "@trpc/server";
import { action, selector } from "../builders";
import {
  getUserByEmail,
  getUserByNormalizedEmail,
  getUserById,
  register,
  revokeAllUserTokens,
} from "../slices/authSlice";
import { usersTable, type User } from "../slices/tables";
import {
  challengePurpose,
  emailChallengesTable,
  emailOutboxTable,
  type EmailJob,
} from "./tables";
import { renderAccountEmail, type EmailKind } from "./templates";
import type { EmailTemplateConfig } from "./config";

export const HOUR = 3_600_000;
export const hashEmailToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

function* enqueue(
  config: EmailTemplateConfig,
  user: User,
  kind: EmailKind,
  now: number,
  token?: string,
  expiresAt?: number,
) {
  yield* insert(emailOutboxTable, [
    {
      id: randomUUID(),
      status: "pending",
      kind,
      payload: JSON.stringify(
        renderAccountEmail(config, user.email, kind, token),
      ),
      ...(token ? { challengeHash: hashEmailToken(token) } : {}),
      createdAt: now,
      deadline: Math.min(now + 23 * HOUR, expiresAt ?? Infinity),
      nextAttemptAt: now,
      attempts: 0,
    },
  ]);
}

function terminal(
  job: EmailJob,
  status: "sent" | "failed" | "cancelled",
  now: number,
): EmailJob {
  // Never retain link credentials or rendered messages in terminal jobs.
  const { payload: _payload, leaseId: _lease, ...metadata } = job;
  return { ...metadata, status, finishedAt: now };
}

function* cancelChallengeJobs(tokenHash: string, now: number) {
  const jobs = yield* selectFrom(emailOutboxTable, "byChallengeHash").where(
    (q) => q.eq("challengeHash", tokenHash),
  );
  for (const job of jobs) {
    if (job.status === "pending")
      yield* upsert(emailOutboxTable, [terminal(job, "cancelled", now)]);
  }
}

function* issueChallenge(
  config: EmailTemplateConfig,
  user: User,
  purpose: "verification" | "passwordReset",
  now: number,
) {
  if (purpose === "verification" && user.emailVerifiedAt)
    return { queued: false, retryAfterSeconds: 0 };
  const id = `${user.id}:${purpose}`;
  const previous = yield* selectFrom(emailChallengesTable, "byId")
    .where((q) => q.eq("id", id))
    .first();
  const sameWindow = previous && now - previous.windowStartedAt < HOUR;
  const retryAt = previous
    ? Math.max(
        previous.lastRequestedAt + 60_000,
        sameWindow && previous.requestCount >= 3
          ? previous.windowStartedAt + HOUR
          : 0,
      )
    : 0;
  if (now < retryAt)
    return {
      queued: false,
      retryAfterSeconds: Math.ceil((retryAt - now) / 1000),
    };
  if (previous) yield* cancelChallengeJobs(previous.tokenHash, now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + (purpose === "verification" ? 24 * HOUR : HOUR);
  yield* upsert(emailChallengesTable, [
    {
      id,
      userId: user.id,
      purpose,
      tokenHash: hashEmailToken(token),
      expiresAt,
      consumed: false,
      windowStartedAt: sameWindow ? previous.windowStartedAt : now,
      requestCount: sameWindow ? previous.requestCount + 1 : 1,
      lastRequestedAt: now,
    },
  ]);
  yield* enqueue(config, user, purpose, now, token, expiresAt);
  return { queued: true, retryAfterSeconds: 60 };
}

export function* enqueueGoogleAccountEmail(
  config: EmailTemplateConfig,
  user: User,
  now: number,
) {
  if (user.emailVerifiedAt) yield* enqueue(config, user, "welcome", now);
  else yield* issueChallenge(config, user, "verification", now);
}

export const registerWithEmail = action({
  name: "registerWithEmail",
  args: {
    email: v.string(),
    hashedPassword: v.string(),
    config: v.pass<EmailTemplateConfig>(),
    now: v.number(),
  },
  handler: function* ({ email, hashedPassword, config, now }) {
    const result = yield* register({ email, hashedPassword });
    const user = (yield* getUserById({ id: result.userId }))!;
    yield* issueChallenge(config, user, "verification", now);
    return result;
  },
});

export const requestVerification = action({
  name: "requestVerification",
  args: {
    userId: v.string(),
    config: v.pass<EmailTemplateConfig>(),
    now: v.number(),
  },
  handler: function* ({ userId, config, now }) {
    const user = yield* getUserById({ id: userId });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return yield* issueChallenge(config, user, "verification", now);
  },
});

export const requestReset = action({
  name: "requestReset",
  args: {
    email: v.string(),
    config: v.pass<EmailTemplateConfig>(),
    now: v.number(),
  },
  handler: function* ({ email, config, now }) {
    const user =
      (yield* getUserByEmail({ email })) ??
      (yield* getUserByNormalizedEmail({ email }));
    if (user) yield* issueChallenge(config, user, "passwordReset", now);
    return { success: true as const };
  },
});

export const requireEmailChallenge = selector({
  name: "requireEmailChallenge",
  args: {
    tokenHash: v.string(),
    purpose: challengePurpose,
    now: v.number(),
  },
  handler: function* ({ tokenHash, purpose, now }) {
    const challenge = yield* selectFrom(emailChallengesTable, "byTokenHash")
      .where((q) => q.eq("tokenHash", tokenHash))
      .first();
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.consumed ||
      challenge.expiresAt <= now
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This link is invalid, expired, or already used. Please request a new one.",
      });
    }
    return challenge;
  },
});

export const consumeEmailChallenge = action({
  name: "consumeEmailChallenge",
  args: {
    tokenHash: v.string(),
    purpose: challengePurpose,
    hashedPassword: v.optional(v.string()),
    config: v.pass<EmailTemplateConfig>(),
    now: v.number(),
  },
  handler: function* ({ tokenHash, purpose, hashedPassword, config, now }) {
    const challenge = yield* requireEmailChallenge({ tokenHash, purpose, now });
    const user = yield* getUserById({ id: challenge.userId });
    if (!user)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This link is no longer valid.",
      });
    if (purpose === "passwordReset" && !hashedPassword)
      throw new Error("Missing reset password hash");
    const timestamp = new Date(now).toISOString();
    yield* upsert(usersTable, [
      {
        ...user,
        emailVerifiedAt: user.emailVerifiedAt ?? timestamp,
        ...(hashedPassword ? { password: hashedPassword } : {}),
        updatedAt: timestamp,
      },
    ]);
    if (!user.emailVerifiedAt) yield* enqueue(config, user, "welcome", now);
    if (purpose === "passwordReset") {
      yield* revokeAllUserTokens({ userId: user.id });
      const challenges = yield* selectFrom(
        emailChallengesTable,
        "byUserId",
      ).where((q) => q.eq("userId", user.id));
      for (const current of challenges) {
        yield* upsert(emailChallengesTable, [{ ...current, consumed: true }]);
        yield* cancelChallengeJobs(current.tokenHash, now);
      }
      yield* enqueue(config, user, "passwordChanged", now);
    } else {
      yield* upsert(emailChallengesTable, [{ ...challenge, consumed: true }]);
      yield* cancelChallengeJobs(challenge.tokenHash, now);
    }
    return { success: true as const, userId: user.id };
  },
});

export const claimEmailJob = action({
  name: "claimEmailJob",
  args: { now: v.number(), leaseId: v.string() },
  handler: function* ({ now, leaseId }) {
    const job = yield* selectFrom(emailOutboxTable, "byDue")
      .where((q) => q.eq("status", "pending").lte("nextAttemptAt", now))
      .first();
    if (!job) return null;
    if (job.deadline <= now) {
      const expired = {
        ...terminal(job, "failed", now),
        failureCode: "expired",
      };
      yield* upsert(emailOutboxTable, [expired]);
      return expired;
    }
    if (job.challengeHash) {
      const challenge = yield* selectFrom(emailChallengesTable, "byTokenHash")
        .where((q) => q.eq("tokenHash", job.challengeHash!))
        .first();
      if (!challenge || challenge.consumed || challenge.expiresAt <= now) {
        const cancelled = terminal(job, "cancelled", now);
        yield* upsert(emailOutboxTable, [cancelled]);
        return cancelled;
      }
    }
    const claimed = {
      ...job,
      leaseId,
      nextAttemptAt: now + 60_000,
      attempts: job.attempts + 1,
    };
    yield* upsert(emailOutboxTable, [claimed]);
    return claimed;
  },
});

export const finishEmailJob = action({
  name: "finishEmailJob",
  args: {
    id: v.string(),
    leaseId: v.string(),
    now: v.number(),
    providerId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    retryAt: v.optional(v.number()),
  },
  handler: function* ({ id, leaseId, now, providerId, failureCode, retryAt }) {
    const job = yield* selectFrom(emailOutboxTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    if (!job || job.status !== "pending" || job.leaseId !== leaseId) return;
    if (retryAt !== undefined && retryAt < job.deadline) {
      const { leaseId: _lease, ...rest } = job;
      yield* upsert(emailOutboxTable, [
        {
          ...rest,
          nextAttemptAt: retryAt,
          ...(failureCode ? { failureCode } : {}),
        },
      ]);
    } else {
      yield* upsert(emailOutboxTable, [
        {
          ...terminal(job, providerId ? "sent" : "failed", now),
          ...(providerId ? { providerId } : {}),
          ...(failureCode ? { failureCode } : {}),
        },
      ]);
    }
  },
});

export const cleanEmailJobs = action({
  name: "cleanEmailJobs",
  args: { now: v.number() },
  handler: function* ({ now }) {
    const old = yield* selectFrom(emailOutboxTable, "byFinishedAt")
      .where((q) =>
        q.gte("finishedAt", 0).lt("finishedAt", now - 7 * 24 * HOUR),
      )
      .limit(100);
    if (old.length)
      yield* deleteRows(
        emailOutboxTable,
        old.map((row) => row.id),
      );
  },
});
