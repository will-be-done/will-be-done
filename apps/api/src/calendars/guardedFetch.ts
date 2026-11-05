import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { getDomain } from "tldts";

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

export type GuardedRequest = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  // Sent only to hosts allowed by `mayShareCredentials` with the first URL.
  authorization?: string;
};

export type GuardedResponse = {
  status: number;
  url: string;
  body: string;
};

const privateRanges = new BlockList();
for (const [base, bits] of [
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
] as const) {
  privateRanges.addSubnet(base, bits, "ipv4");
}
for (const [base, bits] of [
  ["::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(base, bits, "ipv6");
}

// BlockList also matches IPv4-mapped IPv6 (::ffff:7f00:1) against IPv4 ranges.
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  return privateRanges.check(ip, family === 6 ? "ipv6" : "ipv4");
}

const privateHostError = (host: string) =>
  new CalendarFetchError(`${host} is a private network address`);

// Checks the addresses the connection will actually use, so a second DNS
// answer cannot point it somewhere else.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      callback(privateHostError(hostname), "", 0);
      return;
    }
    if (options.all) {
      (callback as (error: null, addresses: LookupAddress[]) => void)(
        null,
        list,
      );
    } else {
      callback(null, list[0]!.address, list[0]!.family);
    }
  });
};

// Credentials stay within one registrable domain (iCloud discovery moves
// between partition hosts) and never go over a downgrade to plain HTTP.
export function mayShareCredentials(from: URL, to: URL): boolean {
  if (from.protocol === "https:" && to.protocol !== "https:") return false;
  if (from.hostname === to.hostname) return true;
  const domain = getDomain(from.hostname, { allowPrivateDomains: true });
  return (
    domain !== null &&
    domain === getDomain(to.hostname, { allowPrivateDomains: true })
  );
}

function send(
  url: URL,
  request: GuardedRequest,
  headers: Record<string, string>,
  options: Required<GuardedFetchOptions>,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, {
      method: request.method ?? "GET",
      headers,
      signal,
      // A pooled socket would skip the lookup check.
      agent: false,
      ...(options.allowPrivateNetworks ? {} : { lookup: publicLookup }),
    });
    req.on("response", resolve);
    req.on("error", reject);
    req.end(request.body);
  });
}

function readCapped(response: IncomingMessage, maxBytes: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > maxBytes) {
        response.destroy();
        reject(new CalendarFetchError("Calendar response is too large"));
        return;
      }
      chunks.push(chunk);
    });
    response.on("end", () =>
      resolve(new TextDecoder().decode(Buffer.concat(chunks))),
    );
    response.on("error", reject);
  });
}

// Fetch for user-supplied calendar URLs: http(s) only, bounded in time and
// size, and kept off private networks unless self-hosting allows them.
export async function guardedFetch(
  input: string,
  request: GuardedRequest,
  {
    allowPrivateNetworks,
    timeoutMs = 15_000,
    maxBytes = 10 * 1024 * 1024,
    maxRedirects = 5,
  }: GuardedFetchOptions,
): Promise<GuardedResponse> {
  const options = { allowPrivateNetworks, timeoutMs, maxBytes, maxRedirects };
  const signal = AbortSignal.timeout(timeoutMs);
  const origin = new URL(input);
  let url = origin;
  let current = request;
  for (let hop = 0; ; hop += 1) {
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new CalendarFetchError("Calendar URL must use http or https");
    }
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivateNetworks && isIP(host) && isPrivateAddress(host)) {
      throw privateHostError(url.hostname);
    }

    const headers = { ...current.headers };
    if (current.authorization && mayShareCredentials(origin, url)) {
      headers.authorization = current.authorization;
    }

    const fail = (error: unknown) => {
      if (error instanceof CalendarFetchError) return error;
      if (signal.aborted) {
        return new CalendarFetchError(
          "Calendar server did not respond in time",
        );
      }
      return new CalendarFetchError(
        `Could not reach ${url.host}: ${(error as Error).message}`,
      );
    };

    const response = await send(url, current, headers, options, signal).catch(
      (error: unknown) => {
        throw fail(error);
      },
    );
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location) {
      response.resume();
      if (hop >= maxRedirects) {
        throw new CalendarFetchError("Too many redirects");
      }
      url = new URL(location, url);
      if (status === 303) {
        current = { ...current, method: "GET", body: undefined };
      }
      continue;
    }

    const body = await readCapped(response, maxBytes).catch(
      (error: unknown) => {
        throw fail(error);
      },
    );
    return { status, url: url.href, body };
  }
}
