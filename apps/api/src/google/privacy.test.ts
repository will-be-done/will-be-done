import { expect, test } from "bun:test";
import {
  redactGoogleAuthRequest,
  redactGoogleAuthUrl,
  redactGoogleAuthSpanData,
} from "./privacy";

test("Google credentials are removed from URLs and separately collected query/cookie fields", () => {
  expect(
    redactGoogleAuthUrl(
      "https://app.example.com/api/auth/google/callback?code=secret&state=state",
    ),
  ).toBe("https://app.example.com/api/auth/google/callback");
  const request: NonNullable<Parameters<typeof redactGoogleAuthRequest>[0]> = {
    url: "https://app.example.com/api/auth/google/launch",
    query_string: "launch=secret",
    cookies: { flow: "secret" },
    headers: { Cookie: "secret", Accept: "text/html" },
  };
  redactGoogleAuthRequest(request);
  expect(request.query_string).toBeUndefined();
  expect(request.cookies).toBeUndefined();
  expect(request.headers).toEqual({ Accept: "text/html" });
  expect(redactGoogleAuthUrl("https://app.example.com/spaces?sort=date")).toBe(
    "https://app.example.com/spaces?sort=date",
  );
});

test("auth trace and child span attributes redact absolute and relative requests", () => {
  for (const key of [
    "url.full",
    "http.url",
    "http.target",
    "url.path",
    "http.route",
  ]) {
    for (const path of [
      "/api/auth/google/launch",
      "/api/auth/google/callback",
    ]) {
      for (const prefix of ["", "https://app.example.com"]) {
        const data: Record<string, unknown> = {
          [key]: `${prefix}${path}?code=secret&launch=secret#fragment`,
          "url.query": "code=secret",
          unrelated: 42,
        };
        redactGoogleAuthSpanData(data);
        expect(data).toEqual({ [key]: `${prefix}${path}`, unrelated: 42 });
      }
    }
  }
  const data = {
    "http.target": "/spaces?sort=date",
    "url.query": "sort=date",
    custom: "kept",
  };
  redactGoogleAuthSpanData(data);
  expect(data).toEqual({
    "http.target": "/spaces?sort=date",
    "url.query": "sort=date",
    custom: "kept",
  });
  const request: NonNullable<Parameters<typeof redactGoogleAuthRequest>[0]> = {
    url: "/api/auth/google/callback?code=secret",
    query_string: "code=secret",
  };
  redactGoogleAuthRequest(request);
  expect(request).toEqual({
    url: "/api/auth/google/callback",
    query_string: undefined,
    cookies: undefined,
  });
});

test("root trace query is scrubbed when only the transaction request has the path", () => {
  const root: Record<string, unknown> = {
    "url.query": "code=secret",
    unrelated: true,
  };
  redactGoogleAuthSpanData(root, "/api/auth/google/callback");
  expect(root).toEqual({ unrelated: true });
  const child: Record<string, unknown> = {
    "url.full": "https://app.example.com/api/auth/google/callback?code=secret",
    "http.target": "?code=secret",
    "url.query": "code=secret",
  };
  redactGoogleAuthSpanData(child);
  expect(child).toEqual({
    "url.full": "https://app.example.com/api/auth/google/callback",
    "http.target": "",
  });
});
