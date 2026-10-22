export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

const hostedAppUrls = [
  "https://app.will-be-done.app",
  "https://app2.will-be-done.app",
];

export function resolveGoogleAppUrl(
  config: GoogleConfig,
  origin = config.appUrl,
) {
  const allowed = hostedAppUrls.includes(config.appUrl)
    ? hostedAppUrls
    : [config.appUrl];
  if (!allowed.includes(origin))
    throw new Error("Unsupported Google sign-in origin");
  return origin;
}

export function parseGoogleConfig(env: {
  WBD_GOOGLE_CLIENT_ID?: string;
  WBD_GOOGLE_CLIENT_SECRET?: string;
  WBD_GOOGLE_PUBLIC_APP_URL?: string;
}): GoogleConfig | null {
  const clientId = env.WBD_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.WBD_GOOGLE_CLIENT_SECRET?.trim();
  const appUrl = env.WBD_GOOGLE_PUBLIC_APP_URL?.trim();
  if (!clientId && !clientSecret && !appUrl) return null;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error(
      "Set WBD_GOOGLE_CLIENT_ID, WBD_GOOGLE_CLIENT_SECRET, and WBD_GOOGLE_PUBLIC_APP_URL together",
    );
  }
  const url = new URL(appUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  ) {
    throw new Error(
      "WBD_GOOGLE_PUBLIC_APP_URL must be an HTTPS origin (HTTP is allowed on localhost)",
    );
  }
  return { clientId, clientSecret, appUrl: url.origin };
}
