import * as Sentry from "@sentry/bun";
import type { FastifyInstance } from "fastify";

type SentryEnvironment = Readonly<Record<string, string | undefined>>;

export interface SentryConfig {
  dsn: string;
  environment?: string;
  release?: string;
  tracesSampleRate: number;
  debug: boolean;
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function tracesSampleRate(value: string | undefined) {
  const configured = nonEmpty(value);
  if (configured === undefined) return 0.1;

  const rate = Number(configured);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(
      "WBD_SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1",
    );
  }
  return rate;
}

export function getSentryConfig(
  env: SentryEnvironment,
): SentryConfig | undefined {
  const dsn = nonEmpty(env.WBD_SENTRY_DSN);
  if (!dsn) return undefined;

  return {
    dsn,
    environment: nonEmpty(env.WBD_SENTRY_ENVIRONMENT),
    release: nonEmpty(env.WBD_SENTRY_RELEASE),
    tracesSampleRate: tracesSampleRate(env.WBD_SENTRY_TRACES_SAMPLE_RATE),
    debug: nonEmpty(env.WBD_SENTRY_DEBUG) === "true",
  };
}

const config = getSentryConfig(process.env);

if (config) {
  const { tracesSampleRate, ...baseConfig } = config;
  Sentry.init({
    ...baseConfig,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    ...(tracesSampleRate > 0 ? { tracesSampleRate } : {}),
    enableLogs: true,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],
  });

  const diagnostics = {
    service: "api",
    environment: config.environment ?? "unset",
    release: config.release ?? "unset",
    tracingEnabled: tracesSampleRate > 0,
    tracesSampleRate,
  };
  Sentry.logger.info("API Sentry initialized", diagnostics);
  console.info("Sentry initialized", diagnostics);
}

export function setupSentryErrorHandler(server: FastifyInstance) {
  if (config) Sentry.setupFastifyErrorHandler(server);
}

export function captureException(error: unknown) {
  if (config) Sentry.captureException(error);
}

export async function closeSentry() {
  if (config) await Sentry.close(2_000);
}
