import { describe, expect, it } from "bun:test";
import { parseEnvConfig } from "./env";

describe("environment config", () => {
  it("applies defaults for unset variables", () => {
    expect(parseEnvConfig({})).toMatchObject({
      WBD_STORAGE_PATH: "/var/lib/will-be-done",
      WBD_DB_PATH: "/var/lib/will-be-done/db",
      WBD_DB_ENGINE: "sqlite",
      WBD_TURSO_GROUP: "default",
      WBD_TURSOD_REQUEST_TIMEOUT_MS: 30_000,
      WBD_SYNC_NOTIFICATIONS_BACKEND: "memory",
      WBD_RATE_LIMIT_ENABLED: true,
      WBD_RATE_LIMIT_BACKEND: "memory",
      WBD_RATE_LIMIT_GLOBAL_MAX: 300,
      WBD_RATE_LIMIT_NAMESPACE: "wbd:rate-limit:v1:",
      WBD_TASK_GENERATION_INTERVAL_MS: 60_000,
      WBD_POSTHOG_HOST: "https://eu.i.posthog.com",
      PORT: 3000,
    });
  });

  it("coerces numbers and booleans, trims tokens, and keeps an explicit DB path", () => {
    expect(
      parseEnvConfig({
        WBD_STORAGE_PATH: "/data",
        WBD_DB_PATH: "/elsewhere/db",
        WBD_RATE_LIMIT_ENABLED: "false",
        WBD_RATE_LIMIT_GLOBAL_MAX: "50",
        WBD_INSTANCE_ID: "  instance-a  ",
        WBD_GOOGLE_CLIENT_ID: "",
        PORT: "8080",
      }),
    ).toMatchObject({
      WBD_DB_PATH: "/elsewhere/db",
      WBD_RATE_LIMIT_ENABLED: false,
      WBD_RATE_LIMIT_GLOBAL_MAX: 50,
      WBD_INSTANCE_ID: "instance-a",
      WBD_GOOGLE_CLIENT_ID: "",
      PORT: 8080,
    });
  });

  it.each([
    ["an unknown engine", { WBD_DB_ENGINE: "postgres" }],
    ["a timeout below the minimum", { WBD_TURSOD_REQUEST_TIMEOUT_MS: "50" }],
    ["a fractional interval", { WBD_TASK_GENERATION_INTERVAL_MS: "1500.5" }],
    ["a non-numeric limit", { WBD_RATE_LIMIT_GLOBAL_MAX: "many" }],
    ["a blank instance id", { WBD_INSTANCE_ID: "   " }],
    ["an invalid PostHog URL", { WBD_POSTHOG_HOST: "not a url" }],
  ])("rejects %s", (_label, env) => {
    expect(() => parseEnvConfig(env)).toThrow();
  });

  it.each([
    [
      { WBD_DB_ENGINE: "turso-cloud", WBD_TURSO_ORG: "org" },
      "Missing required Turso environment variables: WBD_TURSO_PLATFORM_TOKEN",
    ],
    [
      { WBD_DB_ENGINE: "tursod" },
      "Missing required tursod environment variables: WBD_TURSOD_URL, WBD_TURSOD_AUTH_TOKEN",
    ],
    [
      { WBD_SYNC_NOTIFICATIONS_BACKEND: "redis" },
      "WBD_REDIS_URL is required when a Redis-backed service is enabled",
    ],
    [
      { WBD_RATE_LIMIT_BACKEND: "redis" },
      "WBD_REDIS_URL is required when a Redis-backed service is enabled",
    ],
  ])("requires the variables an enabled backend needs", (env, message) => {
    expect(() => parseEnvConfig(env)).toThrow(message);
  });

  it("does not need Redis for a rate-limit backend that is disabled", () => {
    expect(
      parseEnvConfig({
        WBD_RATE_LIMIT_ENABLED: "false",
        WBD_RATE_LIMIT_BACKEND: "redis",
      }).WBD_RATE_LIMIT_BACKEND,
    ).toBe("redis");
  });
});
