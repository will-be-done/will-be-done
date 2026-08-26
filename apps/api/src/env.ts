import "dotenv/config";
import { z } from "zod";

const EnvConfigSchema = z.object({
  WBD_STORAGE_PATH: z.string().default("/var/lib/will-be-done"),
  WBD_DB_PATH: z.string().optional(),
  WBD_DB_ENGINE: z.enum(["sqlite", "turso-cloud", "tursod"]).default("sqlite"),
  WBD_TURSO_ORG: z.string().optional(),
  WBD_TURSO_PLATFORM_TOKEN: z.string().optional(),
  WBD_TURSO_GROUP: z.string().default("default"),
  WBD_TURSO_DATABASE_PREFIX: z.string().default("wbd"),
  WBD_TURSOD_URL: z.url().optional(),
  WBD_TURSOD_AUTH_TOKEN: z.string().trim().min(1).optional(),
  WBD_TURSOD_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(30_000),
  WBD_INSTANCE_ID: z.string().trim().min(1).optional(),
  WBD_SYNC_NOTIFICATIONS_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  WBD_REDIS_URL: z.string().trim().min(1).optional(),
  WBD_RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  WBD_RATE_LIMIT_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  WBD_RATE_LIMIT_NAMESPACE: z
    .string()
    .trim()
    .min(1)
    .default("wbd:rate-limit:v1:"),
  WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX: z
    .string()
    .trim()
    .min(1)
    .default("wbd:sync:v1"),
  WBD_TASK_GENERATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
  WBD_POSTHOG_KEY: z.string().trim().min(1).optional(),
  WBD_POSTHOG_HOST: z.url().default("https://eu.i.posthog.com"),
  WBD_TAWK_API_KEY: z.string().trim().min(1).optional(),
});

let envConfig:
  | {
      WBD_STORAGE_PATH: string;
      WBD_DB_PATH: string;
      WBD_DB_ENGINE: "sqlite" | "turso-cloud" | "tursod";
      WBD_TURSO_ORG?: string;
      WBD_TURSO_PLATFORM_TOKEN?: string;
      WBD_TURSO_GROUP: string;
      WBD_TURSO_DATABASE_PREFIX: string;
      WBD_TURSOD_URL?: string;
      WBD_TURSOD_AUTH_TOKEN?: string;
      WBD_TURSOD_REQUEST_TIMEOUT_MS: number;
      WBD_INSTANCE_ID?: string;
      WBD_SYNC_NOTIFICATIONS_BACKEND: "memory" | "redis";
      WBD_REDIS_URL?: string;
      WBD_RATE_LIMIT_ENABLED: boolean;
      WBD_RATE_LIMIT_BACKEND: "memory" | "redis";
      WBD_RATE_LIMIT_NAMESPACE: string;
      WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX: string;
      WBD_TASK_GENERATION_INTERVAL_MS: number;
      WBD_POSTHOG_KEY?: string;
      WBD_POSTHOG_HOST: string;
      WBD_TAWK_API_KEY?: string;
    }
  | undefined;

export function getEnvConfig() {
  if (envConfig) return envConfig;

  const parsed = EnvConfigSchema.parse({
    WBD_STORAGE_PATH: process.env.WBD_STORAGE_PATH,
    WBD_DB_PATH: process.env.WBD_DB_PATH,
    WBD_DB_ENGINE: process.env.WBD_DB_ENGINE,
    WBD_TURSO_ORG: process.env.WBD_TURSO_ORG,
    WBD_TURSO_PLATFORM_TOKEN: process.env.WBD_TURSO_PLATFORM_TOKEN,
    WBD_TURSO_GROUP: process.env.WBD_TURSO_GROUP,
    WBD_TURSO_DATABASE_PREFIX: process.env.WBD_TURSO_DATABASE_PREFIX,
    WBD_TURSOD_URL: process.env.WBD_TURSOD_URL,
    WBD_TURSOD_AUTH_TOKEN: process.env.WBD_TURSOD_AUTH_TOKEN,
    WBD_TURSOD_REQUEST_TIMEOUT_MS: process.env.WBD_TURSOD_REQUEST_TIMEOUT_MS,
    WBD_INSTANCE_ID: process.env.WBD_INSTANCE_ID,
    WBD_SYNC_NOTIFICATIONS_BACKEND: process.env.WBD_SYNC_NOTIFICATIONS_BACKEND,
    WBD_REDIS_URL: process.env.WBD_REDIS_URL,
    WBD_RATE_LIMIT_ENABLED: process.env.WBD_RATE_LIMIT_ENABLED,
    WBD_RATE_LIMIT_BACKEND: process.env.WBD_RATE_LIMIT_BACKEND,
    WBD_RATE_LIMIT_NAMESPACE: process.env.WBD_RATE_LIMIT_NAMESPACE,
    WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX:
      process.env.WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX,
    WBD_TASK_GENERATION_INTERVAL_MS:
      process.env.WBD_TASK_GENERATION_INTERVAL_MS,
    WBD_POSTHOG_KEY: process.env.WBD_POSTHOG_KEY,
    WBD_POSTHOG_HOST: process.env.WBD_POSTHOG_HOST,
    WBD_TAWK_API_KEY: process.env.WBD_TAWK_API_KEY,
  });

  if (parsed.WBD_DB_ENGINE === "turso-cloud") {
    const missing = [
      ["WBD_TURSO_ORG", parsed.WBD_TURSO_ORG],
      ["WBD_TURSO_PLATFORM_TOKEN", parsed.WBD_TURSO_PLATFORM_TOKEN],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Missing required Turso environment variables: ${missing.join(", ")}`,
      );
    }
  }

  if (parsed.WBD_DB_ENGINE === "tursod") {
    const missing = [
      ["WBD_TURSOD_URL", parsed.WBD_TURSOD_URL],
      ["WBD_TURSOD_AUTH_TOKEN", parsed.WBD_TURSOD_AUTH_TOKEN],
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Missing required tursod environment variables: ${missing.join(", ")}`,
      );
    }
  }

  if (
    (parsed.WBD_SYNC_NOTIFICATIONS_BACKEND === "redis" ||
      (parsed.WBD_RATE_LIMIT_ENABLED &&
        parsed.WBD_RATE_LIMIT_BACKEND === "redis")) &&
    !parsed.WBD_REDIS_URL
  ) {
    throw new Error(
      "WBD_REDIS_URL is required when a Redis-backed service is enabled",
    );
  }

  envConfig = {
    WBD_STORAGE_PATH: parsed.WBD_STORAGE_PATH,
    WBD_DB_PATH: parsed.WBD_DB_PATH ?? `${parsed.WBD_STORAGE_PATH}/db`,
    WBD_DB_ENGINE: parsed.WBD_DB_ENGINE,
    WBD_TURSO_ORG: parsed.WBD_TURSO_ORG,
    WBD_TURSO_PLATFORM_TOKEN: parsed.WBD_TURSO_PLATFORM_TOKEN,
    WBD_TURSO_GROUP: parsed.WBD_TURSO_GROUP,
    WBD_TURSO_DATABASE_PREFIX: parsed.WBD_TURSO_DATABASE_PREFIX,
    WBD_TURSOD_URL: parsed.WBD_TURSOD_URL,
    WBD_TURSOD_AUTH_TOKEN: parsed.WBD_TURSOD_AUTH_TOKEN,
    WBD_TURSOD_REQUEST_TIMEOUT_MS: parsed.WBD_TURSOD_REQUEST_TIMEOUT_MS,
    WBD_INSTANCE_ID: parsed.WBD_INSTANCE_ID,
    WBD_SYNC_NOTIFICATIONS_BACKEND: parsed.WBD_SYNC_NOTIFICATIONS_BACKEND,
    WBD_REDIS_URL: parsed.WBD_REDIS_URL,
    WBD_RATE_LIMIT_ENABLED: parsed.WBD_RATE_LIMIT_ENABLED,
    WBD_RATE_LIMIT_BACKEND: parsed.WBD_RATE_LIMIT_BACKEND,
    WBD_RATE_LIMIT_NAMESPACE: parsed.WBD_RATE_LIMIT_NAMESPACE,
    WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX:
      parsed.WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX,
    WBD_TASK_GENERATION_INTERVAL_MS: parsed.WBD_TASK_GENERATION_INTERVAL_MS,
    WBD_POSTHOG_KEY: parsed.WBD_POSTHOG_KEY,
    WBD_POSTHOG_HOST: parsed.WBD_POSTHOG_HOST,
    WBD_TAWK_API_KEY: parsed.WBD_TAWK_API_KEY,
  };

  return envConfig;
}
