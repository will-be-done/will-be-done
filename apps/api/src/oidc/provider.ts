import * as client from "openid-client";
import { z } from "zod";
import type { OidcConfig } from "./config";
import type { OidcFlow, OidcProfile } from "./tables";

export interface OidcProvider {
  authorizationUrl(flow: OidcFlow): string | Promise<string>;
  verify(code: string, flow: OidcFlow, issuer?: string): Promise<OidcProfile>;
}

export function createOidcProvider(config: OidcConfig): OidcProvider {
  let discovery: Promise<client.Configuration> | undefined;
  const configuration = () => {
    discovery ??= client
      .discovery(
        new URL(config.issuer),
        config.clientId,
        config.clientSecret,
        client.ClientSecretPost(config.clientSecret),
        {
          timeout: 10,
          execute: [
            client.enableNonRepudiationChecks,
            ...(new URL(config.issuer).protocol === "http:"
              ? [client.allowInsecureRequests]
              : []),
          ],
        },
      )
      .catch((error: unknown) => {
        discovery = undefined;
        throw error;
      });
    return discovery;
  };
  const redirectUri = `${config.appUrl}/api/auth/oidc/callback`;
  return {
    async authorizationUrl(flow) {
      return client.buildAuthorizationUrl(await configuration(), {
        redirect_uri: redirectUri,
        scope: "openid email",
        response_type: "code",
        state: flow.id,
        nonce: z.string().parse(flow.nonce),
        code_challenge: await client.calculatePKCECodeChallenge(
          z.string().parse(flow.pkceVerifier),
        ),
        code_challenge_method: "S256",
      }).href;
    },
    async verify(code, flow, issuer) {
      const currentUrl = new URL(redirectUri);
      currentUrl.searchParams.set("code", code);
      currentUrl.searchParams.set("state", flow.id);
      if (issuer !== undefined) currentUrl.searchParams.set("iss", issuer);
      const configurationValue = await configuration();
      const tokens = await client.authorizationCodeGrant(
        configurationValue,
        currentUrl,
        {
          pkceCodeVerifier: z.string().parse(flow.pkceVerifier),
          expectedNonce: z.string().parse(flow.nonce),
          expectedState: flow.id,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      const subject = z.string().min(1).max(255).parse(claims?.sub);
      const profile =
        claims?.email === undefined
          ? await client.fetchUserInfo(
              configurationValue,
              tokens.access_token,
              subject,
            )
          : claims;
      if (profile?.email_verified !== true)
        throw new Error("SSO requires a verified email address");
      return {
        subject,
        email: z.email().parse(profile.email),
        emailAuthoritative: true,
      };
    },
  };
}
