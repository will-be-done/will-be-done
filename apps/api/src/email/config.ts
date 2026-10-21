import { z } from "zod";

export interface EmailConfig {
  apiKey: string;
  from: string;
  appUrl: string;
}

export type EmailTemplateConfig = Pick<EmailConfig, "from" | "appUrl">;

export function parseEmailConfig(env: {
  WBD_RESEND_API_KEY?: string;
  WBD_EMAIL_FROM?: string;
  WBD_PUBLIC_APP_URL?: string;
}): EmailConfig | null {
  const apiKey = env.WBD_RESEND_API_KEY?.trim();
  const from = env.WBD_EMAIL_FROM?.trim();
  const appUrl = env.WBD_PUBLIC_APP_URL?.trim();
  if (!apiKey && !from && !appUrl) return null;
  if (!apiKey || !from || !appUrl) {
    throw new Error(
      "Set WBD_RESEND_API_KEY, WBD_EMAIL_FROM, and WBD_PUBLIC_APP_URL together",
    );
  }
  // Accept either an address or the usual `Display name <address>` form.
  z.email().parse(from.match(/<([^<>]+)>$/)?.[1] ?? from);
  const url = new URL(appUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "WBD_PUBLIC_APP_URL must be an origin without credentials, path, query, or fragment",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(
      "WBD_PUBLIC_APP_URL must use HTTPS outside local development",
    );
  }
  return { apiKey, from, appUrl: url.origin };
}
