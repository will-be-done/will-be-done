// OAuth authorization codes and launch credentials must not enter telemetry.
function isGoogleAuthUrl(value: string): boolean {
  try {
    return new URL(value).pathname.startsWith("/api/auth/google/");
  } catch {
    return false;
  }
}

export function redactGoogleAuthUrl(value: string): string {
  if (!isGoogleAuthUrl(value)) return value;
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function redactGoogleAuthRequest(request?: {
  url?: string;
  query_string?: unknown;
  cookies?: unknown;
  headers?: Record<string, string>;
}) {
  if (!request?.url || !isGoogleAuthUrl(request.url)) return;
  request.url = redactGoogleAuthUrl(request.url);
  request.query_string = undefined;
  request.cookies = undefined;
  for (const key of Object.keys(request.headers ?? {})) {
    if (key.toLowerCase() === "cookie") delete request.headers![key];
  }
}
