import { defineTable, v, type ExtractSchema } from "@will-be-done/hyperdb";

export const googleFlowsTable = defineTable("google_auth_flows", {
  id: v.string(),
  appUrl: v.optional(v.string()),
  secretHash: v.string(),
  launchHash: v.optional(v.string()),
  initiatorHash: v.optional(v.string()),
  loopbackPort: v.optional(v.number()),
  completionHash: v.optional(v.string()),
  cookieHash: v.optional(v.string()),
  nonce: v.optional(v.string()),
  pkceVerifier: v.optional(v.string()),
  intent: v.union(v.literal("signin"), v.literal("link")),
  userId: v.optional(v.string()),
  tokenId: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("launched"),
    v.literal("exchanging"),
    v.literal("ready"),
    v.literal("error"),
  ),
  googleSubject: v.optional(v.string()),
  googleEmail: v.optional(v.string()),
  emailAuthoritative: v.optional(v.boolean()),
  error: v.optional(v.string()),
  expiresAt: v.number(),
}).index("byExpiresAt", ["expiresAt", "id"]);

export type GoogleFlow = ExtractSchema<typeof googleFlowsTable>;
export interface GoogleProfile {
  subject: string;
  email: string;
  emailAuthoritative: boolean;
}
