import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheAllEmoji } from "./emojiCache";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(names = ["one", "two", "three", "four", "five", "six"]) {
  const base = "https://example.com/emoji/";
  const stored = new Map<string, Response>();
  const cache = {
    keys: async () => [...stored.keys()].map((url) => new Request(url)),
    put: async (url: string, response: Response) => {
      stored.set(url, response);
    },
  };
  vi.stubGlobal("location", { href: "https://example.com/" });
  vi.stubGlobal("caches", { open: async () => cache });
  const fetch = vi.fn(async (url: URL | string) =>
    String(url).endsWith("index.json")
      ? Response.json(names)
      : new Response("emoji"),
  );
  vi.stubGlobal("fetch", fetch);
  return { base, stored, fetch };
}

describe("offline emoji cache", () => {
  it.each(["2", "Sat, 31 Oct 2026 00:00:02 GMT"])(
    "pauses all workers for Retry-After %s, then resumes missing images",
    async (retryAfter) => {
      vi.useFakeTimers({ now: new Date("2026-10-31T00:00:00Z") });
      const { base, stored, fetch } = setup();
      stored.set(`${base}one.webp`, new Response("cached"));
      const limited = new Set<string>();
      fetch.mockImplementation(async (url) => {
        if (String(url).endsWith("index.json")) {
          return Response.json(["one", "two", "three", "four", "five", "six"]);
        }
        if (!limited.has(String(url))) {
          limited.add(String(url));
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": retryAfter },
          });
        }
        return new Response("emoji");
      });

      const pending = cacheAllEmoji();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fetch).toHaveBeenCalledTimes(5);
      await vi.runAllTimersAsync();
      await pending;

      expect(stored.size).toBe(6);
      expect(fetch).not.toHaveBeenCalledWith(
        `${base}one.webp`,
        expect.anything(),
      );
      expect([...stored.values()].every((response) => response.ok)).toBe(true);
    },
  );

  it("backs off when the manifest is rate limited too", async () => {
    vi.useFakeTimers();
    const { stored, fetch } = setup(["one"]);
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    );
    const pending = cacheAllEmoji();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    expect(stored.size).toBe(1);
  });

  it("keeps completed images and resumes after a failed download on the next run", async () => {
    const { base, stored, fetch } = setup(["one"]);
    stored.set(`${base}previous.webp`, new Response("cached"));
    fetch.mockImplementationOnce(async () =>
      Response.json(["previous", "one"]),
    );
    fetch.mockRejectedValueOnce(new TypeError("Offline"));
    await expect(cacheAllEmoji()).rejects.toThrow("Offline");
    expect(stored.size).toBe(1);

    await cacheAllEmoji();
    expect(stored.size).toBe(2);
  });

  it.each([null, "invalid"])(
    "uses a fallback delay for Retry-After %s and stops after repeated rate limits",
    async (retryAfter) => {
      vi.useFakeTimers();
      const { stored, fetch } = setup();
      fetch.mockImplementation(
        async () =>
          new Response(null, {
            status: 429,
            headers: retryAfter ? { "Retry-After": retryAfter } : {},
          }),
      );
      const failed = expect(cacheAllEmoji()).rejects.toThrow(": 429");
      await vi.advanceTimersByTimeAsync(59_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.runAllTimersAsync();
      await failed;
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(stored.size).toBe(0);
    },
  );
});
