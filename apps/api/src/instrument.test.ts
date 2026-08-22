import { describe, expect, test } from "vitest";
import { getSentryConfig } from "./instrument";

describe("Sentry configuration", () => {
  test("is disabled without a WBD_SENTRY_DSN", () => {
    expect(getSentryConfig({})).toBeUndefined();
    expect(getSentryConfig({ WBD_SENTRY_DSN: "  " })).toBeUndefined();
  });

  test("uses only WBD-prefixed Sentry settings", () => {
    expect(
      getSentryConfig({
        SENTRY_DSN: "https://ignored@example.com/1",
        WBD_SENTRY_DSN: " https://public@example.com/2 ",
        WBD_SENTRY_ENVIRONMENT: " staging ",
        WBD_SENTRY_RELEASE: " api@abc123 ",
      }),
    ).toEqual({
      dsn: "https://public@example.com/2",
      environment: "staging",
      release: "api@abc123",
    });
  });
});
