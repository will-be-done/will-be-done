import { defineTable, v, type ExtractSchema } from "@will-be-done/hyperdb";

export const challengePurpose = v.union(
  v.literal("verification"),
  v.literal("passwordReset"),
  v.literal("emailChange"),
);
export const emailChallengesTable = defineTable("account_email_challenges", {
  id: v.string(), // One slot per user and purpose; retain counters after consumption.
  userId: v.string(),
  email: v.optional(v.string()),
  newEmail: v.optional(v.string()),
  purpose: challengePurpose,
  tokenHash: v.string(),
  expiresAt: v.number(),
  consumed: v.boolean(),
  windowStartedAt: v.number(),
  requestCount: v.number(),
  lastRequestedAt: v.number(),
})
  .index("byTokenHash", ["tokenHash"], { type: "uniqhash" })
  .index("byUserId", ["userId"]);
export type EmailChallenge = ExtractSchema<typeof emailChallengesTable>;

export const emailOutboxTable = defineTable("account_email_outbox", {
  id: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("sent"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  kind: v.string(),
  payload: v.optional(v.string()),
  challengeHash: v.optional(v.string()),
  createdAt: v.number(),
  deadline: v.number(),
  nextAttemptAt: v.number(),
  attempts: v.number(),
  leaseId: v.optional(v.string()),
  finishedAt: v.optional(v.number()),
  providerId: v.optional(v.string()),
  failureCode: v.optional(v.string()),
})
  .index("byDue", ["status", "nextAttemptAt", "id"])
  .index("byChallengeHash", ["challengeHash"])
  .index("byFinishedAt", ["finishedAt", "id"]);
export type EmailJob = ExtractSchema<typeof emailOutboxTable>;

export const accountEmailTables = [emailChallengesTable, emailOutboxTable];
