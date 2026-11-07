import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { z } from "zod";
import type { GoogleConfig } from "./config";
import { resolveGoogleAppUrl } from "./config";
import type { GoogleFlow, GoogleProfile } from "./tables";

export class GoogleIdentityError extends Schema.TaggedError<GoogleIdentityError>()(
  "GoogleIdentityError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {}

export interface GoogleProvider {
  authorizationUrl(flow: GoogleFlow): string;
  verify(
    code: string,
    flow: GoogleFlow,
  ): Effect.Effect<GoogleProfile, GoogleIdentityError>;
}

const identityError = (message: string) => (cause: unknown) =>
  new GoogleIdentityError({ message, cause });

export function createGoogleProvider(config: GoogleConfig): GoogleProvider {
  const client = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: `${config.appUrl}/api/auth/google/callback`,
    transporterOptions: { timeout: 10_000, retry: false },
  });
  const redirectUri = (flow: GoogleFlow) =>
    `${resolveGoogleAppUrl(config, flow.appUrl)}/api/auth/google/callback`;
  return {
    authorizationUrl(flow) {
      return client.generateAuthUrl({
        redirect_uri: redirectUri(flow),
        scope: ["openid", "email"],
        state: flow.id,
        nonce: flow.nonce,
        code_challenge: createHash("sha256")
          .update(z.string().parse(flow.pkceVerifier))
          .digest("base64url"),
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: "select_account",
      });
    },
    verify: Effect.fn("GoogleProvider.verify")(function* (
      code: string,
      flow: GoogleFlow,
    ) {
      const { tokens } = yield* Effect.tryPromise({
        try: () =>
          client.getToken({
            code,
            redirect_uri: redirectUri(flow),
            codeVerifier: flow.pkceVerifier,
          }),
        catch: identityError("Google token exchange failed"),
      });
      const idToken = tokens.id_token;
      if (!idToken) {
        return yield* new GoogleIdentityError({
          message: "Missing Google ID token",
        });
      }
      const ticket = yield* Effect.tryPromise({
        try: () => client.verifyIdToken({ idToken, audience: config.clientId }),
        catch: identityError("Invalid Google ID token"),
      });
      const payload = ticket.getPayload();
      if (
        !payload ||
        payload.nonce !== flow.nonce ||
        !flow.nonce ||
        !z.string().min(1).max(255).safeParse(payload.sub).success ||
        payload.email_verified !== true ||
        !z.email().safeParse(payload.email).success
      ) {
        return yield* new GoogleIdentityError({
          message: "Invalid Google identity",
        });
      }
      return {
        subject: payload.sub,
        email: payload.email!,
        emailAuthoritative:
          payload.email!.toLowerCase().endsWith("@gmail.com") ||
          Boolean(payload.hd),
      };
    }),
  };
}
