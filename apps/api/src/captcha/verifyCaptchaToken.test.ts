import { describe, expect, test } from "bun:test";
import { Effect, Exit, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { verifyCaptchaToken } from "./verifyCaptchaToken";

const verify = (fetch: typeof globalThis.fetch, timeout = 1_000) =>
  Effect.runPromiseExit(
    verifyCaptchaToken("token", "secret", timeout).pipe(
      Effect.provide(
        FetchHttpClient.layer.pipe(
          Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
        ),
      ),
    ),
  );

describe("CAPTCHA verification", () => {
  test("posts the token to Cloudflare and returns its verdict", async () => {
    const requests: unknown[] = [];
    const fetch = (async (input, init) => {
      requests.push({
        url: String(input),
        body: await new Response(init?.body).json(),
      });
      return Response.json({ success: true, "error-codes": [] });
    }) as typeof globalThis.fetch;

    expect(await verify(fetch)).toEqual(Exit.succeed(true));
    expect(requests).toEqual([
      {
        url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        body: { secret: "secret", response: "token" },
      },
    ]);
  });

  test("treats a timed-out verification as a failed CAPTCHA", async () => {
    const fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof globalThis.fetch;

    expect(await verify(fetch, 1)).toEqual(Exit.succeed(false));
  });

  test("fails on a transport error", async () => {
    const fetch = (async (_input, _init): Promise<Response> => {
      throw new Error("fetch failed");
    }) as typeof globalThis.fetch;

    const exit = await verify(fetch);
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
