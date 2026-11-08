import { Clock, Data, Effect, Layer, Option } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http";
import { BrowserCaches } from "@/services/browser";

// Must match the emoji runtimeCaching cacheName in vite.config.ts, which
// serves these entries. Rename both when the emoji set changes.
const EMOJI_CACHE = "emoji-images";
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

class EmojiCacheError extends Data.TaggedError("EmojiCacheError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const retryDelayMs = (retryAfter: string | undefined, now: number) => {
  const delay = retryAfter
    ? /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1_000
      : Date.parse(retryAfter) - now
    : NaN;
  return Number.isFinite(delay) ? Math.max(1_000, delay) : 60_000;
};

const tryEmoji = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new EmojiCacheError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

// Downloads every emoji the service worker does not have yet, so all of them
// work offline. Rate limits pause all workers. Any other failure stops new
// downloads, lets those in flight finish, and leaves the rest for next load.
export const cacheMissingEmoji = (base: URL) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const caches = yield* BrowserCaches;
    let retryAt = 0;
    let failure: EmojiCacheError | undefined;
    const fetchEmoji = (url: URL | string) =>
      Effect.gen(function* () {
        for (let attempt = 0; ; attempt++) {
          for (
            let now = yield* Clock.currentTimeMillis;
            now < retryAt;
            now = yield* Clock.currentTimeMillis
          ) {
            yield* Effect.sleep(retryAt - now);
          }
          if (failure) return yield* failure;
          const response = yield* client
            .execute(HttpClientRequest.get(url))
            .pipe(
              Effect.mapError(
                (error) =>
                  new EmojiCacheError({
                    message:
                      error.cause instanceof Error
                        ? error.cause.message
                        : error.message,
                    cause: error,
                  }),
              ),
            );
          if (response.status >= 200 && response.status < 300) return response;
          yield* Effect.ignore(
            tryEmoji(async () =>
              Option.getOrUndefined(
                HttpClientResponse.toWeb(response),
              )?.body?.cancel(),
            ),
          );
          if (response.status !== 429 || attempt === MAX_RETRIES) {
            return yield* new EmojiCacheError({
              message: `Failed to cache ${url}: ${response.status}`,
            });
          }
          const now = yield* Clock.currentTimeMillis;
          retryAt = Math.max(
            retryAt,
            now + retryDelayMs(response.headers["retry-after"], now),
          );
        }
      });

    const [names, cache] = yield* Effect.all(
      [
        fetchEmoji(new URL("index.json", base)).pipe(
          Effect.flatMap((response) => response.json),
          Effect.mapError((error) =>
            error instanceof EmojiCacheError
              ? error
              : new EmojiCacheError({ message: error.message, cause: error }),
          ),
          Effect.map((names) => names as string[]),
        ),
        tryEmoji(() => caches.open(EMOJI_CACHE)),
      ],
      { concurrency: "unbounded" },
    );
    const keys = yield* tryEmoji(() => cache.keys());
    const cached = new Set(keys.map((request) => request.url));
    const missing = names
      .map((name) => new URL(`${name}.webp`, base).href)
      .filter((url) => !cached.has(url));

    yield* Effect.forEach(
      missing,
      (url) =>
        failure
          ? Effect.void
          : fetchEmoji(url).pipe(
              Effect.flatMap((response) =>
                Option.match(HttpClientResponse.toWeb(response), {
                  onSome: (web) => tryEmoji(() => cache.put(url, web)),
                  // Cache Storage needs the fetch client's own Response.
                  onNone: () =>
                    Effect.die(
                      new Error("Emoji caching needs FetchHttpClient"),
                    ),
                }),
              ),
              Effect.catch((error) =>
                Effect.sync(() => {
                  failure ??= error;
                }),
              ),
            ),
      { concurrency: CONCURRENCY, discard: true },
    );
    if (failure) return yield* failure;
  });

const EmojiLive = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.RequestInit, { priority: "low" }),
  Layer.sync(BrowserCaches, () => caches),
);

export const cacheAllEmoji = () =>
  Effect.runPromise(
    cacheMissingEmoji(
      new URL(`${import.meta.env.BASE_URL}emoji/`, location.href),
    ).pipe(Effect.provide(EmojiLive)),
  );
