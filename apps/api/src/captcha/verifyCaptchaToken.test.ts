import { afterEach, describe, expect, test } from "bun:test";
import { verifyCaptchaTokenWithTimeout } from "./verifyCaptchaToken";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CAPTCHA verification", () => {
  test("passes an abort signal to Cloudflare and preserves a timely response", async () => {
    globalThis.fetch = (async (_input, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ success: true, "error-codes": [] });
    }) as typeof fetch;

    expect(await verifyCaptchaTokenWithTimeout("token", "secret", 1_000)).toBe(
      true,
    );
  });

  test("treats an aborted verification as a failed CAPTCHA", async () => {
    globalThis.fetch = ((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof fetch;

    expect(await verifyCaptchaTokenWithTimeout("token", "secret", 1)).toBe(
      false,
    );
  });
});
