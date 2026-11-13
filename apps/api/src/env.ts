import "dotenv/config";
import { Context, Effect, Layer, Schema } from "effect";

const optionalString = Schema.optional(Schema.String);
const nonEmptyTrimmed = Schema.Trim.check(Schema.isMinLength(1));
const optionalNonEmptyTrimmed = Schema.optional(nonEmptyTrimmed);
const url = Schema.String.check(
  Schema.makeFilter((value) => URL.canParse(value) || "Expected a URL"),
);
const withDefault = <S extends Schema.Top & { readonly Encoded: string }>(
  schema: S,
  value: string,
) => schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(value)));
const intFromString = (minimum: number) =>
  Schema.NumberFromString.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(minimum),
  );
const literals = <const L extends ReadonlyArray<string>>(values: L) =>
  Schema.Literals(values);

const EnvConfigSchema = Schema.Struct({
  WBD_GOOGLE_CLIENT_ID: optionalString,
  WBD_GOOGLE_CLIENT_SECRET: optionalString,
  WBD_GOOGLE_PUBLIC_APP_URL: optionalString,
  WBD_EMAIL_RESEND_API_KEY: optionalString,
  WBD_EMAIL_FROM: optionalString,
  WBD_EMAIL_PUBLIC_APP_URL: optionalString,
  WBD_STORAGE_PATH: withDefault(Schema.String, "/var/lib/will-be-done"),
  WBD_DB_PATH: optionalString,
  WBD_DB_ENGINE: withDefault(
    literals(["sqlite", "turso-cloud", "tursod"]),
    "sqlite",
  ),
  WBD_TURSO_ORG: optionalString,
  WBD_TURSO_PLATFORM_TOKEN: optionalString,
  WBD_TURSO_GROUP: withDefault(Schema.String, "default"),
  WBD_TURSO_DATABASE_PREFIX: withDefault(Schema.String, "wbd"),
  WBD_TURSOD_URL: Schema.optional(url),
  WBD_TURSOD_AUTH_TOKEN: optionalNonEmptyTrimmed,
  WBD_TURSOD_REQUEST_TIMEOUT_MS: withDefault(intFromString(100), "30000"),
  WBD_SQL_DEBUG: withDefault(literals(["true", "false"]), "false"),
  WBD_INSTANCE_ID: optionalNonEmptyTrimmed,
  WBD_SYNC_NOTIFICATIONS_BACKEND: withDefault(
    literals(["memory", "redis"]),
    "memory",
  ),
  WBD_REDIS_URL: optionalNonEmptyTrimmed,
  WBD_RATE_LIMIT_ENABLED: withDefault(literals(["true", "false"]), "true"),
  WBD_RATE_LIMIT_BACKEND: withDefault(literals(["memory", "redis"]), "memory"),
  WBD_RATE_LIMIT_GLOBAL_MAX: withDefault(intFromString(1), "300"),
  WBD_RATE_LIMIT_NAMESPACE: withDefault(nonEmptyTrimmed, "wbd:rate-limit:v1:"),
  WBD_SYNC_NOTIFICATIONS_CHANNEL_PREFIX: withDefault(
    nonEmptyTrimmed,
    "wbd:sync:v1",
  ),
  WBD_TASK_GENERATION_INTERVAL_MS: withDefault(intFromString(1_000), "60000"),
  WBD_POSTHOG_KEY: optionalNonEmptyTrimmed,
  WBD_POSTHOG_HOST: withDefault(url, "https://eu.i.posthog.com"),
  WBD_CALENDAR_ENCRYPTION_KEY: Schema.optional(
    Schema.Trim.check(Schema.isMinLength(32)),
  ),
  WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS: withDefault(
    literals(["true", "false"]),
    "false",
  ),
  WBD_CALENDAR_SYNC_INTERVAL_MS: withDefault(intFromString(60_000), "900000"),
  WBD_ATTACHMENTS_STORAGE: withDefault(literals(["local", "s3"]), "local"),
  WBD_ATTACHMENTS_PATH: optionalNonEmptyTrimmed,
  WBD_ATTACHMENTS_S3_ACCESS_KEY_ID: optionalNonEmptyTrimmed,
  WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY: optionalNonEmptyTrimmed,
  WBD_ATTACHMENTS_S3_ENDPOINT: Schema.optional(url),
  WBD_ATTACHMENTS_S3_BUCKET_NAME: optionalNonEmptyTrimmed,
  WBD_ATTACHMENTS_S3_REGION: withDefault(nonEmptyTrimmed, "us-east-1"),
  WBD_ATTACHMENTS_S3_PREFIX: withDefault(Schema.String, "attachments/"),
  PORT: withDefault(intFromString(0), "3000"),
});

const requireVariables = (
  label: string,
  variables: Record<string, string | undefined>,
) => {
  const missing = Object.entries(variables)
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Missing required ${label} environment variables: ${missing.join(", ")}`,
    );
  }
};

export const parseEnvConfig = (env: NodeJS.ProcessEnv) => {
  const parsed = Schema.decodeUnknownSync(EnvConfigSchema)(env);

  if (parsed.WBD_DB_ENGINE === "turso-cloud") {
    requireVariables("Turso", {
      WBD_TURSO_ORG: parsed.WBD_TURSO_ORG,
      WBD_TURSO_PLATFORM_TOKEN: parsed.WBD_TURSO_PLATFORM_TOKEN,
    });
  }
  if (parsed.WBD_DB_ENGINE === "tursod") {
    requireVariables("tursod", {
      WBD_TURSOD_URL: parsed.WBD_TURSOD_URL,
      WBD_TURSOD_AUTH_TOKEN: parsed.WBD_TURSOD_AUTH_TOKEN,
    });
  }

  if (parsed.WBD_ATTACHMENTS_STORAGE === "s3") {
    requireVariables("attachment S3", {
      WBD_ATTACHMENTS_S3_ACCESS_KEY_ID: parsed.WBD_ATTACHMENTS_S3_ACCESS_KEY_ID,
      WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY:
        parsed.WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY,
      WBD_ATTACHMENTS_S3_BUCKET_NAME: parsed.WBD_ATTACHMENTS_S3_BUCKET_NAME,
    });
  }

  const rateLimitEnabled = parsed.WBD_RATE_LIMIT_ENABLED === "true";
  if (
    (parsed.WBD_SYNC_NOTIFICATIONS_BACKEND === "redis" ||
      (rateLimitEnabled && parsed.WBD_RATE_LIMIT_BACKEND === "redis")) &&
    !parsed.WBD_REDIS_URL
  ) {
    throw new Error(
      "WBD_REDIS_URL is required when a Redis-backed service is enabled",
    );
  }

  return {
    ...parsed,
    WBD_DB_PATH: parsed.WBD_DB_PATH ?? `${parsed.WBD_STORAGE_PATH}/db`,
    WBD_ATTACHMENTS_PATH:
      parsed.WBD_ATTACHMENTS_PATH ?? `${parsed.WBD_STORAGE_PATH}/attachments`,
    WBD_RATE_LIMIT_ENABLED: rateLimitEnabled,
    WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS:
      parsed.WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS === "true",
  };
};

export type EnvConfig = ReturnType<typeof parseEnvConfig>;

let envConfig: EnvConfig | undefined;

export function getEnvConfig(): EnvConfig {
  envConfig ??= parseEnvConfig(process.env);
  return envConfig;
}

export class AppEnv extends Context.Service<AppEnv, EnvConfig>()(
  "@will-be-done/api/AppEnv",
) {
  static readonly layer = Layer.effect(AppEnv, Effect.try(getEnvConfig));
}
