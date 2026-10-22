import { createHash } from "node:crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { z } from "zod";
import type { GoogleConfig } from "./config";
import { resolveGoogleAppUrl } from "./config";
import type { GoogleFlow, GoogleProfile } from "./tables";

export interface GoogleProvider {
  authorizationUrl(flow: GoogleFlow): string;
  verify(code: string, flow: GoogleFlow): Promise<GoogleProfile>;
}

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
    async verify(code, flow) {
      const { tokens } = await client.getToken({
        code,
        redirect_uri: redirectUri(flow),
        codeVerifier: flow.pkceVerifier,
      });
      if (!tokens.id_token) throw new Error("Missing Google ID token");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: config.clientId,
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
        throw new Error("Invalid Google identity");
      }
      return {
        subject: payload.sub,
        email: payload.email!,
        emailAuthoritative:
          payload.email!.toLowerCase().endsWith("@gmail.com") ||
          Boolean(payload.hd),
      };
    },
  };
}
