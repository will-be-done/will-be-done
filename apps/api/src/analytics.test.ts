import { describe, expect, test } from "bun:test";
import {
  capturePublicApiProductEvent,
  createBackendAnalytics,
  getBackendAnalyticsConfig,
  type BackendAnalyticsEvent,
} from "./analytics";

describe("backend analytics", () => {
  test("stays disabled when the PostHog key is absent or blank", () => {
    expect(getBackendAnalyticsConfig({})).toBeUndefined();
    expect(
      getBackendAnalyticsConfig({ WBD_POSTHOG_KEY: "   " }),
    ).toBeUndefined();

    let clientCreated = false;
    createBackendAnalytics({}, () => {
      clientCreated = true;
      throw new Error("should not create a client");
    });
    expect(clientCreated).toBe(false);
  });

  test("captures typed events and shuts down once", async () => {
    const captured: unknown[] = [];
    let shutdownCount = 0;
    const analytics = createBackendAnalytics(
      {
        WBD_POSTHOG_KEY: " project-token ",
        WBD_POSTHOG_HOST: " https://analytics.example.com ",
      },
      (config) => {
        expect(config).toEqual({
          key: "project-token",
          host: "https://analytics.example.com",
        });
        return {
          capture: (event) => captured.push(event),
          shutdown: async () => {
            shutdownCount += 1;
          },
        };
      },
    );

    analytics.capture({
      name: "user_signed_up",
      distinctId: "user-1",
      properties: { captcha_enabled: true },
    });
    expect(captured).toEqual([
      {
        distinctId: "user-1",
        event: "user_signed_up",
        properties: { app_surface: "backend", captcha_enabled: true },
      },
    ]);

    await analytics.shutdown();
    await analytics.shutdown();
    analytics.capture({ name: "login_succeeded", distinctId: "user-1" });
    expect(shutdownCount).toBe(1);
    expect(captured).toHaveLength(1);
  });

  test("derives successful public API product events", () => {
    const captured: BackendAnalyticsEvent[] = [];
    const analytics = {
      capture: (event: BackendAnalyticsEvent) => captured.push(event),
      shutdown: async () => {},
    };

    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "createSpace",
      statusCode: 201,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "deleteSpace",
      statusCode: 204,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "createSectionTask",
      statusCode: 201,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "createStashTask",
      statusCode: 500,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "createTaskTemplate",
      statusCode: 201,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "convertTaskToTemplate",
      statusCode: 200,
    });
    capturePublicApiProductEvent(analytics, {
      distinctId: "user-1",
      operation: "createTaskTemplateChecklistItem",
      statusCode: 201,
    });

    expect(captured).toEqual([
      {
        name: "space_created",
        distinctId: "user-1",
        properties: { creation_method: "api" },
      },
      {
        name: "space_deleted",
        distinctId: "user-1",
        properties: { deletion_method: "api" },
      },
      {
        name: "task_created",
        distinctId: "user-1",
        properties: { creation_method: "api", location: "project" },
      },
      {
        name: "task_template_created",
        distinctId: "user-1",
        properties: { creation_method: "api", source: "direct" },
      },
      {
        name: "task_template_created",
        distinctId: "user-1",
        properties: {
          creation_method: "api",
          source: "task_conversion",
        },
      },
      {
        name: "checklist_item_created",
        distinctId: "user-1",
        properties: { creation_method: "api" },
      },
    ]);
  });
});
