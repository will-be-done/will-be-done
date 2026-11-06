import { expect, test } from "bun:test";
import { handleCallback } from "./login.ts";
import { normalizeServer } from "./settings.ts";

const callback = (query: string) =>
  handleCallback(
    new URL(`http://127.0.0.1:4000/callback?${query}`),
    "expected",
  );

test("accepts a token only with the matching state", () => {
  expect(callback("state=expected&token=abc").result).toEqual({
    _tag: "Token",
    token: "abc",
  });
  expect(callback("state=other&token=abc").result._tag).toBe("Ignored");
  expect(callback("token=abc").result._tag).toBe("Ignored");
});

test("treats a callback without a token as a cancelled login", () => {
  expect(callback("state=expected&error=access_denied").result._tag).toBe(
    "Denied",
  );
});

test("ignores other paths", () => {
  const { result, response } = handleCallback(
    new URL("http://127.0.0.1:4000/favicon.ico?state=expected&token=abc"),
    "expected",
  );
  expect(result._tag).toBe("Ignored");
  expect(response.status).toBe(404);
});

test("normalizeServer", () => {
  expect(normalizeServer("app.will-be-done.app")).toBe(
    "https://app.will-be-done.app",
  );
  expect(normalizeServer("localhost:5173")).toBe("http://localhost:5173");
  expect(normalizeServer("http://localhost:5173/spaces")).toBe(
    "http://localhost:5173",
  );
  expect(normalizeServer("ftp://example.com")).toBeUndefined();
});
