// OAuth authorization codes and launch credentials must not enter telemetry.
function isGoogleAuthUrl(value: string): boolean {
  try {
    return new URL(value, "https://redaction.invalid").pathname.startsWith(
      "/api/auth/google/",
    );
  } catch {
    return false;
  }
}

export function redactGoogleAuthUrl(value: string): string {
  if (!isGoogleAuthUrl(value)) return value;
  if (!/^https?:\/\//i.test(value)) return value.split(/[?#]/, 1)[0];
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

export function redactGoogleAuthSpanData(
  data?: Record<string, unknown>,
  requestUrl?: string,
) {
  if (!data) return;
  const urlKeys = [
    "url.full",
    "http.url",
    "http.target",
    "url.path",
    "http.route",
  ];
  if (
    !(requestUrl && isGoogleAuthUrl(requestUrl)) &&
    !urlKeys.some(
      (key) => typeof data[key] === "string" && isGoogleAuthUrl(data[key]),
    )
  )
    return;
  for (const key of urlKeys) {
    if (typeof data[key] === "string") {
      const value = data[key];
      data[key] = /^[a-z][a-z\d+.-]*:/i.test(value)
        ? redactGoogleAuthUrl(value)
        : value.split(/[?#]/, 1)[0];
    }
  }
  delete data["url.query"];
}
