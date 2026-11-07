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
const cacheMissingEmoji = Effect.gen(function* () {
  let retryAt = 0;
  let failure: EmojiCacheError | undefined;
  const fetchEmoji = (url: URL | string) =>
    Effect.gen(function* () {
      for (let attempt = 0; ; attempt++) {
        while (Date.now() < retryAt) {
          yield* Effect.sleep(retryAt - Date.now());
        }
        if (failure) return yield* failure;
        const response = yield* tryEmoji(() => fetch(url, { priority: "low" }));
        if (response.ok) return response;
        yield* Effect.ignore(tryEmoji(async () => response.body?.cancel()));
        if (response.status !== 429 || attempt === MAX_RETRIES) {
          return yield* new EmojiCacheError({
            message: `Failed to cache ${url}: ${response.status}`,
          });
        }
        retryAt = Math.max(retryAt, Date.now() + retryDelayMs(response));
      }
    });

  const base = new URL(`${import.meta.env.BASE_URL}emoji/`, location.href);
  const [names, cache] = yield* Effect.all(
    [
      fetchEmoji(new URL("index.json", base)).pipe(
        Effect.flatMap((response) =>
          tryEmoji(() => response.json() as Promise<string[]>),
        ),
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
              tryEmoji(() => cache.put(url, response)),
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

export const cacheAllEmoji = () => Effect.runPromise(cacheMissingEmoji);
