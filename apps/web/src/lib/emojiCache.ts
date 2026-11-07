import { Data, Effect } from "effect";

// Must match the emoji runtimeCaching cacheName in vite.config.ts, which
// serves these entries. Rename both when the emoji set changes.
const EMOJI_CACHE = "emoji-images";
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

class EmojiCacheError extends Data.TaggedError("EmojiCacheError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const retryDelayMs = (response: Response) => {
  const retryAfter = response.headers.get("Retry-After");
  const delay = retryAfter
    ? /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1_000
      : Date.parse(retryAfter) - Date.now()
    : NaN;
  return Number.isFinite(delay) ? Math.max(1_000, delay) : 60_000;
};

// Downloads every emoji the service worker does not have yet, so all of them
// work offline. Rate limits pause all workers; other failures resume next load.
const cacheMissingEmoji = Effect.gen(function* () {
  let retryAt = 0;
  const fetchEmoji = (url: URL | string) =>
    Effect.gen(function* () {
      for (let attempt = 0; ; attempt++) {
        while (Date.now() < retryAt) {
          yield* Effect.sleep(retryAt - Date.now());
        }
        const response = yield* Effect.tryPromise({
          try: () => fetch(url, { priority: "low" }),
          catch: (cause) =>
            new EmojiCacheError({
              message: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        });
        if (response.ok) return response;
        if (response.status !== 429 || attempt === MAX_RETRIES) {
          return yield* new EmojiCacheError({
            message: `Failed to cache ${url}: ${response.status}`,
          });
        }
        retryAt = Math.max(retryAt, Date.now() + retryDelayMs(response));
        yield* Effect.promise(async () => response.body?.cancel());
      }
    });

  const base = new URL(`${import.meta.env.BASE_URL}emoji/`, location.href);
  const [names, cache] = yield* Effect.all(
    [
      fetchEmoji(new URL("index.json", base)).pipe(
        Effect.flatMap((response) =>
          Effect.promise(() => response.json() as Promise<string[]>),
        ),
      ),
      Effect.promise(() => caches.open(EMOJI_CACHE)),
    ],
    { concurrency: "unbounded" },
  );
  const keys = yield* Effect.promise(() => cache.keys());
  const cached = new Set(keys.map((request) => request.url));
  const missing = names
    .map((name) => new URL(`${name}.webp`, base).href)
    .filter((url) => !cached.has(url));

  yield* Effect.forEach(
    missing,
    (url) =>
      fetchEmoji(url).pipe(
        Effect.flatMap((response) =>
          Effect.promise(() => cache.put(url, response)),
        ),
      ),
    { concurrency: CONCURRENCY, discard: true },
  );
});

export const cacheAllEmoji = () => Effect.runPromise(cacheMissingEmoji);
