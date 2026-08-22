import * as Sentry from "@sentry/react";

export function shouldEnableSentry(dsn: string | undefined): dsn is string {
  return Boolean(dsn?.trim());
}

export function initSentry(
  router: Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0],
) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!shouldEnableSentry(dsn)) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 0.1,
  });

  return true;
}
