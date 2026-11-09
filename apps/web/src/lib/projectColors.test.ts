import { describe, expect, it } from "vitest";
import { getProjectCardStyle, projectColorsFromPixels } from "./projectColors";

describe("project card colors", () => {
  it("finds the dominant hue and skips transparent pixels", () => {
    const colors = projectColorsFromPixels([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 0,
    ]);
    expect(colors).toEqual({
      cardBackgroundColor: "#3f0c0c",
      accentColor: "#ff5a5a",
    });
  });
  it("handles empty and grayscale images", () => {
    expect(projectColorsFromPixels([]).accentColor).toBe("#60a5fa");
    const colors = projectColorsFromPixels([128, 128, 128, 255]);
    expect(colors.cardBackgroundColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(colors.accentColor).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("keeps the standard theme when no colors are configured", () => {
    expect(getProjectCardStyle(undefined)).toBeUndefined();
    expect(
      getProjectCardStyle({ cardBackgroundColor: null, accentColor: null }),
    ).toBeUndefined();
  });
  it("switches text contrast for light and dark cards without overriding focus shadows", () => {
    const light = getProjectCardStyle({
      cardBackgroundColor: "#ffffff",
      accentColor: "#224488",
    });
    const dark = getProjectCardStyle({ cardBackgroundColor: "#111111" });
    expect(light).toMatchObject({
      "--color-content": "#111827",
      borderLeftColor: "#224488",
    });
    expect(dark).toMatchObject({ "--color-content": "#f8fafc" });
    expect(light).not.toHaveProperty("boxShadow");
  });
});
