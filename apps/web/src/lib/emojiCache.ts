// Must match the emoji runtimeCaching cacheName in vite.config.ts, which
// serves these entries. Rename both when the emoji set changes.
const EMOJI_CACHE = "emoji-images";
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

// Downloads every emoji the service worker does not have yet, so all of them
// work offline. Rate limits pause all workers; other failures resume next load.
export async function cacheAllEmoji() {
  let retryAt = 0;
  let stopped = false;
  const fetchEmoji = async (url: URL | string) => {
    try {
      for (let attempt = 0; ; attempt++) {
        while (Date.now() < retryAt) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryAt - Date.now()),
          );
        }
        if (stopped) throw new Error("Emoji caching stopped");
        const response = await fetch(url, { priority: "low" });
        if (response.ok) return response;
        if (response.status !== 429 || attempt === MAX_RETRIES) {
          throw new Error(`Failed to cache ${url}: ${response.status}`);
        }

        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter
          ? /^\d+$/.test(retryAfter)
            ? Number(retryAfter) * 1_000
            : Date.parse(retryAfter) - Date.now()
          : NaN;
        retryAt = Math.max(
          retryAt,
          Date.now() +
            (Number.isFinite(delay) ? Math.max(1_000, delay) : 60_000),
        );
        await response.body?.cancel();
      }
    } catch (error) {
      stopped = true;
      throw error;
    }
  };

  const base = new URL(`${import.meta.env.BASE_URL}emoji/`, location.href);
  const [names, cache] = await Promise.all([
    fetchEmoji(new URL("index.json", base)).then(
      (response) => response.json() as Promise<string[]>,
    ),
    caches.open(EMOJI_CACHE),
  ]);
  const cached = new Set((await cache.keys()).map((request) => request.url));
  const missing = names
    .map((name) => new URL(`${name}.webp`, base).href)
    .filter((url) => !cached.has(url));

  const download = async () => {
    for (let url = missing.pop(); url && !stopped; url = missing.pop()) {
      const response = await fetchEmoji(url);
      await cache.put(url, response);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, download));
}
