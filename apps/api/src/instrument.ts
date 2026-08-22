import * as Sentry from "@sentry/bun";
import type { FastifyInstance } from "fastify";

type SentryEnvironment = Readonly<Record<string, string | undefined>>;

export interface SentryConfig {
  dsn: string;
  environment?: string;
  release?: string;
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
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
  };
}

const config = getSentryConfig(process.env);

if (config) {
  Sentry.init({
    ...config,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    tracesSampleRate: 0.1,
    enableLogs: true,
  });
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
