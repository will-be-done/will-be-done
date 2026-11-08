import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Data, Effect } from "effect";
import {
  HttpBody,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import { getDomain } from "tldts";

export class CalendarFetchError extends Data.TaggedError("CalendarFetchError")<{
  readonly message: string;
  readonly status?: number;
}> {}

export type CalendarHttpOptions = {
  allowPrivateNetworks: boolean;
  maxBytes?: number;
};

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

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

class PrivateHostError extends Error {
  constructor(host: string) {
    super(`${host} is a private network address`);
  }
}

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
      callback(new PrivateHostError(hostname), "", 0);
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

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

// HttpClient for user-supplied calendar URLs: http(s) only, size-capped, and
// kept off private networks unless self-hosting allows them. It sends one hop
// over node:http, because fetch cannot check the addresses DNS returns, and
// leaves redirects to `sendCalendarRequest`.
export const guardedHttpClient = ({
  allowPrivateNetworks,
  maxBytes = 10 * 1024 * 1024,
}: CalendarHttpOptions) =>
  HttpClient.make((request, url, signal) =>
    Effect.callback<
      HttpClientResponse.HttpClientResponse,
      HttpClientError.HttpClientError
    >((resume) => {
      const fail = (description: string, cause?: unknown) =>
        resume(
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                description,
                cause,
              }),
            }),
          ),
        );
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        fail("Calendar URL must use http or https");
        return;
      }
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (!allowPrivateNetworks && isIP(host) && isPrivateAddress(host)) {
        fail(new PrivateHostError(url.hostname).message);
        return;
      }

      const req = (url.protocol === "https:" ? https : http).request(url, {
        method: request.method,
        headers: request.headers,
        signal,
        // A pooled socket would skip the lookup check.
        agent: false,
        ...(allowPrivateNetworks ? {} : { lookup: publicLookup }),
      });
      req.on("error", (error) => {
        if (signal.aborted) return;
        fail(
          error instanceof PrivateHostError
            ? error.message
            : `Could not reach ${url.host}: ${error.message}`,
          error,
        );
      });
      req.on("response", (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          if (size > maxBytes) {
            response.destroy();
            fail("Calendar response is too large");
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (size > maxBytes) return;
          const status = response.statusCode ?? 0;
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            for (const item of [value ?? []].flat()) headers.append(name, item);
          }
          resume(
            Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                new Response(
                  NULL_BODY_STATUSES.has(status) ? null : Buffer.concat(chunks),
                  { status, headers },
                ),
              ),
            ),
          );
        });
      });
      const { body } = request;
      req.end(body._tag === "Uint8Array" ? Buffer.from(body.body) : undefined);
    }),
  );

const describe = (error: HttpClientError.HttpClientError) =>
  error.reason._tag === "TransportError" && error.reason.description
    ? error.reason.description
    : error.message;

// Sends a calendar request through the current HttpClient, following
// redirects itself: `authorization` goes only to hosts `mayShareCredentials`
// allows from the first URL. The response's request URL is the final one.
export const sendCalendarRequest = (
  request: HttpClientRequest.HttpClientRequest,
  authorization?: string,
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const origin = new URL(request.url);
    let current = request;
    for (let hop = 0; ; hop += 1) {
      const url = new URL(current.url);
      const response = yield* client.execute(
        authorization && mayShareCredentials(origin, url)
          ? HttpClientRequest.setHeader(current, "authorization", authorization)
          : current,
      );
      const location = response.headers.location;
      if (response.status < 300 || response.status >= 400 || !location) {
        return response;
      }
      if (hop >= MAX_REDIRECTS) {
        return yield* new CalendarFetchError({ message: "Too many redirects" });
      }
      current = HttpClientRequest.setUrl(current, new URL(location, url).href);
      if (response.status === 303) {
        current = HttpClientRequest.setBody(
          HttpClientRequest.setMethod(current, "GET"),
          HttpBody.empty,
        );
      }
    }
  }).pipe(
    Effect.timeoutOrElse({
      duration: TIMEOUT_MS,
      orElse: () =>
        Effect.fail(
          new CalendarFetchError({
            message: "Calendar server did not respond in time",
          }),
        ),
    }),
    Effect.catchTag("HttpClientError", (error) =>
      Effect.fail(new CalendarFetchError({ message: describe(error) })),
    ),
  );

// The transport has read the whole body already, so this cannot fail on I/O.
export const responseText = (response: HttpClientResponse.HttpClientResponse) =>
  response.text.pipe(
    Effect.catchTag("HttpClientError", (error) =>
      Effect.fail(new CalendarFetchError({ message: describe(error) })),
    ),
  );
