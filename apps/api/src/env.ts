import "dotenv/config";
import { z } from "zod";

const EnvConfigSchema = z.object({
  WBD_STORAGE_PATH: z.string().default("/var/lib/will-be-done"),
  WBD_DB_PATH: z.string().optional(),
  WBD_DB_ENGINE: z.enum(["sqlite", "turso"]).default("sqlite"),
  WBD_TURSO_ORG: z.string().optional(),
  WBD_TURSO_PLATFORM_TOKEN: z.string().optional(),
  WBD_TURSO_GROUP: z.string().default("default"),
  WBD_TURSO_DATABASE_PREFIX: z.string().default("wbd"),
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
});

let envConfig:
  | {
      WBD_STORAGE_PATH: string;
      WBD_DB_PATH: string;
      WBD_DB_ENGINE: "sqlite" | "turso";
      WBD_TURSO_ORG?: string;
      WBD_TURSO_PLATFORM_TOKEN?: string;
      WBD_TURSO_GROUP: string;
      WBD_TURSO_DATABASE_PREFIX: string;
      WBD_INSTANCE_ID?: string;
      WBD_SYNC_NOTIFICATIONS_BACKEND: "memory" | "redis";
      WBD_REDIS_URL?: string;
      WBD_RATE_LIMIT_ENABLED: boolean;
      WBD_RATE_LIMIT_BACKEND: "memory" | "redis";
      WBD_RATE_LIMIT_NAMESPACE: string;
      WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX: string;
      WBD_TASK_GENERATION_INTERVAL_MS: number;
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
  });

  if (parsed.WBD_DB_ENGINE === "turso") {
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
    WBD_INSTANCE_ID: parsed.WBD_INSTANCE_ID,
    WBD_SYNC_NOTIFICATIONS_BACKEND: parsed.WBD_SYNC_NOTIFICATIONS_BACKEND,
    WBD_REDIS_URL: parsed.WBD_REDIS_URL,
    WBD_RATE_LIMIT_ENABLED: parsed.WBD_RATE_LIMIT_ENABLED,
    WBD_RATE_LIMIT_BACKEND: parsed.WBD_RATE_LIMIT_BACKEND,
    WBD_RATE_LIMIT_NAMESPACE: parsed.WBD_RATE_LIMIT_NAMESPACE,
    WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX:
      parsed.WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX,
    WBD_TASK_GENERATION_INTERVAL_MS: parsed.WBD_TASK_GENERATION_INTERVAL_MS,
  };

  return envConfig;
}
