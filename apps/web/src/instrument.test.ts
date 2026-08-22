import { describe, expect, it } from "vitest";
import { shouldEnableSentry } from "./instrument";

describe("Sentry activation", () => {
  it("enables Sentry when a DSN is configured", () => {
    expect(shouldEnableSentry("https://public@example.com/1")).toBe(true);
  });

  it("does not enable Sentry without a DSN", () => {
    expect(shouldEnableSentry(undefined)).toBe(false);
    expect(shouldEnableSentry("  ")).toBe(false);
  });
});
