import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class CalendarFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CalendarFetchError";
  }
}

export type GuardedFetchOptions = {
  allowPrivateNetworks: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

export type GuardedResponse = {
  status: number;
  url: string;
  headers: Headers;
  body: string;
};

const ipv4ToNumber = (ip: string) =>
  ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);

const ipv4Blocks: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const value = ipv4ToNumber(ip);
    return ipv4Blocks.some(([base, bits]) => {
      const size = 2 ** (32 - bits);
      const start = ipv4ToNumber(base);
      return value >= start && value < start + size;
    });
  }
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff")
  );
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new CalendarFetchError(
      `${url.hostname} is a private network address`,
    );
  }
}

// iCloud and others redirect to partition hosts under the same domain; keep
// credentials only within that domain.
const sameSite = (a: URL, b: URL) => {
  if (a.host === b.host) return true;
  const site = a.hostname.split(".").slice(-2).join(".");
  return b.hostname === site || b.hostname.endsWith(`.${site}`);
};

async function readCapped(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new CalendarFetchError("Calendar response is too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Fetch for user-supplied calendar URLs: http(s) only, bounded in time and
// size, and kept off private networks unless self-hosting allows them.
export async function guardedFetch(
  input: string,
  init: RequestInit,
  {
    allowPrivateNetworks,
    timeoutMs = 15_000,
    maxBytes = 10 * 1024 * 1024,
    maxRedirects = 5,
  }: GuardedFetchOptions,
): Promise<GuardedResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = new URL(input);
  let requestInit = init;
  for (let hop = 0; ; hop += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new CalendarFetchError("Calendar URL must use http or https");
    }
    if (!allowPrivateNetworks) await assertPublicHost(url);

    let response: Response;
    try {
      response = await fetch(url, {
        ...requestInit,
        redirect: "manual",
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new CalendarFetchError("Calendar server did not respond in time");
      }
      throw new CalendarFetchError(
        `Could not reach ${url.host}: ${(error as Error).message}`,
      );
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (hop >= maxRedirects) {
        throw new CalendarFetchError("Too many redirects");
      }
      const next = new URL(location, url);
      const headers = new Headers(requestInit.headers);
      if (!sameSite(url, next)) headers.delete("authorization");
      requestInit =
        response.status === 303
          ? { ...requestInit, method: "GET", body: undefined, headers }
          : { ...requestInit, headers };
      url = next;
      continue;
    }

    return {
      status: response.status,
      url: url.href,
      headers: response.headers,
      body: await readCapped(response, maxBytes),
    };
  }
}
