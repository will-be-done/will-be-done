const ANALYTICS_HOSTNAME = "app.will-be-done.app";
const DEFAULT_POSTHOG_HOST = "https://a.will-be-done.app";
const DEFAULT_POSTHOG_UI_HOST = "https://eu.posthog.com";

type PostHogClient = (typeof import("posthog-js"))["default"];

export type TaskCreationLocation = "daily_list" | "project" | "stash";

export type WebAnalyticsEvent =
  | {
      name:
        | "signup_page_viewed"
        | "login_page_viewed"
        | "login_submitted"
        | "authenticated_app_opened";
    }
  | {
      name: "signup_submitted";
      properties: { captcha_enabled: boolean };
    }
  | {
      name: "signup_failed";
      properties: { reason: "password_mismatch" | "request_failed" };
    }
  | {
      name: "login_failed";
      properties: { reason: "request_failed" };
    }
  | {
      name: "task_created";
      properties: {
        creation_method: "add_button" | "sibling";
        location: TaskCreationLocation;
      };
    }
  | {
      name: "task_completed" | "task_reopened";
      properties: { age_hours: number };
    }
  | {
      name: "task_scheduled";
      properties: {
        days_ahead: number;
        scheduling_method: "date_picker" | "today_shortcut";
      };
    }
  | {
      name: "space_created";
      properties: { creation_method: "web" };
    }
  | {
      name: "space_deleted";
      properties: { deletion_method: "web" };
    }
  | {
      name: "project_created" | "checklist_item_created";
      properties: { creation_method: "web" };
    }
  | {
      name: "import_completed";
      properties: {
        provider: "ticktick" | "todoist";
        task_count: number;
      };
    };

interface WebAnalyticsRuntime {
  hostname: string;
  isDesktop: boolean;
  key?: string;
}

let enabled = false;
let clientPromise: Promise<PostHogClient | null> | undefined;
let identifiedUserId: string | undefined;
let visibilityListenerAttached = false;
const capturedOnce = new Set<string>();

function captureDailyAuthenticatedActivity() {
  if (!identifiedUserId) return;

  const utcDate = new Date().toISOString().slice(0, 10);
  captureWebAnalyticsOnce(
    `authenticated_app_opened:${identifiedUserId}:${utcDate}`,
    { name: "authenticated_app_opened" },
  );
}

export function shouldEnableWebAnalytics({
  hostname,
  isDesktop,
  key,
}: WebAnalyticsRuntime) {
  return hostname === ANALYTICS_HOSTNAME && !isDesktop && Boolean(key?.trim());
}

export function initializeWebAnalytics() {
  if (enabled) return true;

  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  if (
    !key ||
    !shouldEnableWebAnalytics({
      hostname: window.location.hostname,
      isDesktop: Boolean(window.desktopApi),
      key,
    })
  ) {
    return false;
  }

  enabled = true;
  clientPromise = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: import.meta.env.VITE_POSTHOG_HOST || DEFAULT_POSTHOG_HOST,
        ui_host:
          import.meta.env.VITE_POSTHOG_UI_HOST || DEFAULT_POSTHOG_UI_HOST,
        defaults: "2026-05-30",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        advanced_disable_flags: true,
        person_profiles: "identified_only",
      });
      return posthog;
    })
    .catch((error) => {
      enabled = false;
      console.error("PostHog initialization failed", error);
      return null;
    });
  if (!visibilityListenerAttached) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        captureDailyAuthenticatedActivity();
      }
    });
    visibilityListenerAttached = true;
  }
  return true;
}

export function captureWebAnalytics(event: WebAnalyticsEvent) {
  if (!enabled || !clientPromise) return;

  void clientPromise.then((posthog) => {
    posthog?.capture(event.name, {
      app_surface: "web",
      ...("properties" in event ? event.properties : {}),
    });
  });
}

export function captureWebAnalyticsOnce(key: string, event: WebAnalyticsEvent) {
  if (!enabled || capturedOnce.has(key)) return;
  capturedOnce.add(key);
  captureWebAnalytics(event);
}

export function identifyWebAnalyticsUser(userId: string) {
  if (!enabled || !clientPromise) return;

  identifiedUserId = userId;
  void clientPromise.then((posthog) => posthog?.identify(userId));
  captureDailyAuthenticatedActivity();
}

export function resetWebAnalytics() {
  if (!enabled || !clientPromise) return;

  void clientPromise.then((posthog) => posthog?.reset());
  identifiedUserId = undefined;
  capturedOnce.clear();
}
