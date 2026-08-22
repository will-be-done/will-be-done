import { describe, expect, it } from "vitest";
import { isFeaturebaseHostname } from "./featurebaseHostname";

describe("Featurebase hostname gate", () => {
  it.each([
    "will-be-done.app",
    "app.will-be-done.app",
    "demo.will-be-done.app",
  ])("allows %s", (hostname) => {
    expect(isFeaturebaseHostname(hostname)).toBe(true);
  });

  it.each([
    "localhost",
    "127.0.0.1",
    "wbd-app-prod.fly.dev",
    "will-be-done.app.example.com",
  ])("blocks %s", (hostname) => {
    expect(isFeaturebaseHostname(hostname)).toBe(false);
  });
});
