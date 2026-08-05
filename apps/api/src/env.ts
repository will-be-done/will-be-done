import { z } from "zod";

const EnvConfigSchema = z.object({
  WBD_STORAGE_PATH: z.string().default("/var/lib/will-be-done"),
  WBD_DB_PATH: z.string().optional(),
  DB_ENGINE: z
    .union([z.literal("sqlite-local"), z.literal("turso-serverless")])
    .default("sqlite-local"),
  TURSO_ORG_SLUG: z.string().optional(),
  TURSO_API_KEY: z.string().optional(),
  TURSO_GROUP: z.string().default("default"),
  TURSO_DB_NAME_PREFIX: z.string().default("wbd"),
  TURSO_MAIN_DATABASE_URL: z.string().optional(),
  TURSO_MAIN_DB_AUTH_TOKEN: z.string().optional(),
});

let envConfig:
  | {
      WBD_STORAGE_PATH: string;
      WBD_DB_PATH: string;
      DB_ENGINE: "sqlite-local" | "turso-serverless";
      TURSO_ORG_SLUG?: string;
      TURSO_API_KEY?: string;
      TURSO_GROUP: string;
      TURSO_DB_NAME_PREFIX: string;
      TURSO_MAIN_DATABASE_URL?: string;
      TURSO_MAIN_DB_AUTH_TOKEN?: string;
    }
  | undefined;

export function getEnvConfig() {
  if (envConfig) return envConfig;

  const parsed = EnvConfigSchema.parse({
    WBD_STORAGE_PATH: process.env.WBD_STORAGE_PATH,
    WBD_DB_PATH: process.env.WBD_DB_PATH,
    DB_ENGINE: process.env.DB_ENGINE,
    TURSO_ORG_SLUG: process.env.TURSO_ORG_SLUG,
    TURSO_API_KEY: process.env.TURSO_API_KEY,
    TURSO_GROUP: process.env.TURSO_GROUP,
    TURSO_DB_NAME_PREFIX: process.env.TURSO_DB_NAME_PREFIX,
    TURSO_MAIN_DATABASE_URL: process.env.TURSO_MAIN_DATABASE_URL,
    TURSO_MAIN_DB_AUTH_TOKEN: process.env.TURSO_MAIN_DB_AUTH_TOKEN,
  });

  if (parsed.DB_ENGINE === "turso-serverless") {
    const missing = [
      "TURSO_ORG_SLUG",
      "TURSO_API_KEY",
      "TURSO_MAIN_DATABASE_URL",
      "TURSO_MAIN_DB_AUTH_TOKEN",
    ].filter((key) => !parsed[key as keyof typeof parsed]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required Turso environment variables: ${missing.join(", ")}`,
      );
    }
  }

  envConfig = {
    WBD_STORAGE_PATH: parsed.WBD_STORAGE_PATH,
    WBD_DB_PATH: parsed.WBD_DB_PATH ?? `${parsed.WBD_STORAGE_PATH}/db`,
    DB_ENGINE: parsed.DB_ENGINE,
    TURSO_ORG_SLUG: parsed.TURSO_ORG_SLUG,
    TURSO_API_KEY: parsed.TURSO_API_KEY,
    TURSO_GROUP: parsed.TURSO_GROUP,
    TURSO_DB_NAME_PREFIX: parsed.TURSO_DB_NAME_PREFIX,
    TURSO_MAIN_DATABASE_URL: parsed.TURSO_MAIN_DATABASE_URL,
    TURSO_MAIN_DB_AUTH_TOKEN: parsed.TURSO_MAIN_DB_AUTH_TOKEN,
  };

  return envConfig;
}
