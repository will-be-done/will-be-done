import { expect, test } from "bun:test";
import { redactGoogleAuthRequest, redactGoogleAuthUrl } from "./privacy";

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
