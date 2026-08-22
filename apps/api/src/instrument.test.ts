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
        WBD_SENTRY_TRACES_SAMPLE_RATE: " 0.25 ",
        WBD_SENTRY_DEBUG: "true",
      }),
    ).toEqual({
      dsn: "https://public@example.com/2",
      environment: "staging",
      release: "api@abc123",
      tracesSampleRate: 0.25,
      debug: true,
    });
  });

  test("samples 10 percent of traces by default", () => {
    expect(
      getSentryConfig({ WBD_SENTRY_DSN: "https://public@example.com/2" }),
    ).toMatchObject({ tracesSampleRate: 0.1, debug: false });
  });

  test("accepts zero to disable tracing", () => {
    expect(
      getSentryConfig({
        WBD_SENTRY_DSN: "https://public@example.com/2",
        WBD_SENTRY_TRACES_SAMPLE_RATE: "0",
      }),
    ).toMatchObject({ tracesSampleRate: 0 });
  });

  test("rejects an invalid trace sample rate", () => {
    expect(() =>
      getSentryConfig({
        WBD_SENTRY_DSN: "https://public@example.com/2",
        WBD_SENTRY_TRACES_SAMPLE_RATE: "2",
      }),
    ).toThrow("WBD_SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1");
  });
});
