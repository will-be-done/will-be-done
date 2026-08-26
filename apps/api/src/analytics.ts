import { PostHog } from "posthog-node";

export type BackendAnalyticsEvent =
  | {
      name: "user_signed_up";
      distinctId: string;
      properties: { captcha_enabled: boolean };
    }
  | {
      name: "login_succeeded" | "api_token_created";
      distinctId: string;
    }
  | {
      name: "public_api_used";
      distinctId: string;
      properties: {
        method: string;
        operation: string;
        status_class: string;
      };
    }
  | {
      name: "task_created";
      distinctId: string;
      properties: {
        creation_method: "api";
        location: "project" | "stash";
      };
    }
  | {
      name: "project_created" | "checklist_item_created";
      distinctId: string;
      properties: { creation_method: "api" };
    };

export interface BackendAnalytics {
  capture(event: BackendAnalyticsEvent): void;
  shutdown(): Promise<void>;
}

interface AnalyticsEnvironment {
  WBD_POSTHOG_KEY?: string;
  WBD_POSTHOG_HOST?: string;
}

interface PostHogClient {
  capture(event: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }): void;
  shutdown(): Promise<void>;
}

interface PostHogConfig {
  key: string;
  host: string;
}

const DEFAULT_POSTHOG_HOST = "https://eu.i.posthog.com";

export const noopBackendAnalytics: BackendAnalytics = {
  capture: () => {},
  shutdown: async () => {},
};

export function getBackendAnalyticsConfig(
  env: AnalyticsEnvironment,
): PostHogConfig | undefined {
  const key = env.WBD_POSTHOG_KEY?.trim();
  if (!key) return undefined;

  return {
    key,
    host: env.WBD_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
  };
}

export function createBackendAnalytics(
  env: AnalyticsEnvironment,
  createClient: (config: PostHogConfig) => PostHogClient = ({ key, host }) =>
    new PostHog(key, { host }),
): BackendAnalytics {
  const config = getBackendAnalyticsConfig(env);
  if (!config) return noopBackendAnalytics;

  let client: PostHogClient;
  try {
    client = createClient(config);
  } catch (error) {
    console.error("PostHog initialization failed", error);
    return noopBackendAnalytics;
  }

  let closed = false;

  return {
    capture(event) {
      if (closed) return;

      try {
        client.capture({
          distinctId: event.distinctId,
          event: event.name,
          properties: {
            app_surface: "backend",
            ...("properties" in event ? event.properties : {}),
          },
        });
      } catch (error) {
        console.error("PostHog capture failed", error);
      }
    },
    async shutdown() {
      if (closed) return;
      closed = true;

      try {
        await client.shutdown();
      } catch (error) {
        console.error("PostHog shutdown failed", error);
      }
    },
  };
}

export function capturePublicApiProductEvent(
  analytics: BackendAnalytics,
  input: {
    distinctId: string;
    operation: string;
    statusCode: number;
  },
) {
  if (input.statusCode < 200 || input.statusCode >= 300) return;

  if (input.operation === "createSectionTask") {
    analytics.capture({
      name: "task_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api", location: "project" },
    });
  } else if (input.operation === "createStashTask") {
    analytics.capture({
      name: "task_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api", location: "stash" },
    });
  } else if (input.operation === "createProject") {
    analytics.capture({
      name: "project_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api" },
    });
  } else if (input.operation === "createTaskChecklistItem") {
    analytics.capture({
      name: "checklist_item_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api" },
    });
  }
}
