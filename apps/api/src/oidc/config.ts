export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  name: string;
}

export function parseOidcConfig(env: {
  WBD_OIDC_ISSUER?: string;
  WBD_OIDC_CLIENT_ID?: string;
  WBD_OIDC_CLIENT_SECRET?: string;
  WBD_OIDC_PUBLIC_APP_URL?: string;
  WBD_OIDC_NAME?: string;
}): OidcConfig | null {
  const issuer = env.WBD_OIDC_ISSUER?.trim();
  const clientId = env.WBD_OIDC_CLIENT_ID?.trim();
  const clientSecret = env.WBD_OIDC_CLIENT_SECRET?.trim();
  const appUrl = env.WBD_OIDC_PUBLIC_APP_URL?.trim();
  if (
    !issuer &&
    !clientId &&
    !clientSecret &&
    !appUrl &&
    !env.WBD_OIDC_NAME?.trim()
  )
    return null;
  if (!issuer || !clientId || !clientSecret || !appUrl) {
    throw new Error(
      "Set WBD_OIDC_ISSUER, WBD_OIDC_CLIENT_ID, WBD_OIDC_CLIENT_SECRET, and WBD_OIDC_PUBLIC_APP_URL together",
    );
  }
  for (const [name, value] of [
    ["WBD_OIDC_ISSUER", issuer],
    ["WBD_OIDC_PUBLIC_APP_URL", appUrl],
  ]) {
    const url = new URL(value!);
    if (name === "WBD_OIDC_ISSUER" && url.pathname.includes("/.well-known/"))
      throw new Error(
        "WBD_OIDC_ISSUER must be the issuer URL, not its discovery document URL",
      );
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      (name === "WBD_OIDC_PUBLIC_APP_URL" && url.pathname !== "/")
    ) {
      throw new Error(
        `${name} must be an HTTPS ${name === "WBD_OIDC_ISSUER" ? "issuer URL" : "origin"} (HTTP is allowed on localhost)`,
      );
    }
  }
  return {
    issuer,
    clientId,
    clientSecret,
    appUrl: new URL(appUrl).origin,
    name: env.WBD_OIDC_NAME?.trim() || "SSO",
  };
}

export function resolveOidcAppUrl(config: OidcConfig, origin = config.appUrl) {
  if (origin !== config.appUrl)
    throw new Error("Unsupported SSO sign-in origin");
  return origin;
}
