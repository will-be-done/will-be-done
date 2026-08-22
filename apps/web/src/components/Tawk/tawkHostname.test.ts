import { describe, expect, test } from "vitest";
import { isTawkHostname } from "./tawkHostname";

describe("Tawk hostname gate", () => {
  test.each([
    "will-be-done.app",
    "app.will-be-done.app",
    "demo.will-be-done.app",
    "deep.app.will-be-done.app",
  ])("allows %s", (hostname) => {
    expect(isTawkHostname(hostname)).toBe(true);
  });

  test.each([
    "localhost",
    "127.0.0.1",
    "will-be-done.app.example.com",
    "evilwill-be-done.app",
    "will-be-done.dev",
    "",
  ])("rejects %s", (hostname) => {
    expect(isTawkHostname(hostname)).toBe(false);
  });
});
