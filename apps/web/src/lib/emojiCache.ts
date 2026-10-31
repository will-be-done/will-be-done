// Must match the emoji runtimeCaching cacheName in vite.config.ts, which
// serves these entries. Rename both when the emoji set changes.
const EMOJI_CACHE = "emoji-images";
const CONCURRENCY = 4;

// Downloads every emoji the service worker does not have yet, so all of them
// work offline. Stops on the first failure; the next app load resumes.
export async function cacheAllEmoji() {
  const base = new URL(`${import.meta.env.BASE_URL}emoji/`, location.href);
  const [names, cache] = await Promise.all([
    fetch(new URL("index.json", base)).then(
      (response) => response.json() as Promise<string[]>,
    ),
    caches.open(EMOJI_CACHE),
  ]);
  const cached = new Set((await cache.keys()).map((request) => request.url));
  const missing = names
    .map((name) => new URL(`${name}.webp`, base).href)
    .filter((url) => !cached.has(url));

  const download = async () => {
    for (let url = missing.pop(); url; url = missing.pop()) {
      const response = await fetch(url, { priority: "low" });
      if (!response.ok) throw new Error(`Failed to cache ${url}`);
      await cache.put(url, response);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, download));
}
