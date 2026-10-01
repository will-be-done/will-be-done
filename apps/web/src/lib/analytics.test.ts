import { describe, expect, it } from "vitest";
import { shouldEnableWebAnalytics } from "./analytics";

describe("web analytics activation", () => {
  it("enables only on the hosted web app with a project token", () => {
    expect(
      shouldEnableWebAnalytics({
        hostname: "app.will-be-done.app",
        isDesktop: false,
        key: "phc_project",
      }),
    ).toBe(true);

    for (const hostname of [
      "will-be-done.app",
      "demo.will-be-done.app",
      "staging.will-be-done.app",
      "localhost",
      "app.will-be-done.app.example.com",
    ]) {
      expect(
        shouldEnableWebAnalytics({
          hostname,
          isDesktop: false,
          key: "phc_project",
        }),
      ).toBe(false);
    }
  });

  it("stays disabled in Electron and without a project token", () => {
    expect(
      shouldEnableWebAnalytics({
        hostname: "app.will-be-done.app",
        isDesktop: true,
        key: "phc_project",
      }),
    ).toBe(false);
    expect(
      shouldEnableWebAnalytics({
        hostname: "app.will-be-done.app",
        isDesktop: false,
      }),
    ).toBe(false);
  });
});
