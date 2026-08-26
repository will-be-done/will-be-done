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
      name: "task_deleted";
      distinctId: string;
      properties: {
        age_hours: number;
        deletion_method: "api";
        previous_state: "todo" | "done";
      };
    }
  | {
      name: "task_scheduled";
      distinctId: string;
      properties: {
        days_ahead: number;
        scheduling_method: "api";
      };
    }
  | {
      name: "task_rescheduled";
      distinctId: string;
      properties: {
        days_ahead: number;
        previous_days_ahead: number;
        scheduling_method: "api";
      };
    }
  | {
      name: "task_unscheduled";
      distinctId: string;
      properties: {
        previous_days_ahead: number;
        unscheduling_method: "api";
      };
    }
  | {
      name: "space_created" | "project_created" | "checklist_item_created";
      distinctId: string;
      properties: { creation_method: "api" };
    }
  | {
      name: "space_deleted";
      distinctId: string;
      properties: { deletion_method: "api" };
    }
  | {
      name: "task_template_created";
      distinctId: string;
      properties: {
        creation_method: "api";
        source: "direct" | "task_conversion";
      };
    }
  | {
      name: "checklist_item_completed";
      distinctId: string;
      properties: {
        completion_method: "api";
        parent_type: "task" | "template";
      };
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

  if (input.operation === "createSpace") {
    analytics.capture({
      name: "space_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api" },
    });
  } else if (input.operation === "deleteSpace") {
    analytics.capture({
      name: "space_deleted",
      distinctId: input.distinctId,
      properties: { deletion_method: "api" },
    });
  } else if (input.operation === "createSectionTask") {
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
  } else if (
    input.operation === "createTaskChecklistItem" ||
    input.operation === "createTaskTemplateChecklistItem"
  ) {
    analytics.capture({
      name: "checklist_item_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api" },
    });
  } else if (input.operation === "createTaskTemplate") {
    analytics.capture({
      name: "task_template_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api", source: "direct" },
    });
  } else if (input.operation === "convertTaskToTemplate") {
    analytics.capture({
      name: "task_template_created",
      distinctId: input.distinctId,
      properties: { creation_method: "api", source: "task_conversion" },
    });
  }
}
