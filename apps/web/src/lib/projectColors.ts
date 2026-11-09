import type { CSSProperties } from "react";
import type { Project } from "@will-be-done/slices/space";

type ProjectColors = Pick<Project, "cardBackgroundColor" | "accentColor">;
const hex = (rgb: number[]) =>
  "#" +
  rgb
    .map((n) =>
      Math.min(255, Math.max(0, Math.round(n)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const rgb = (color: string) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const valid = (color: string | null | undefined): color is string =>
  !!color && /^#[0-9a-f]{6}$/i.test(color);

export function projectColorsFromPixels(pixels: ArrayLike<number>) {
  const buckets = new Map<string, { count: number; rgb: number[] }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue;
    const values = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    const key = values.map((n) => n >> 5).join(",");
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      for (let c = 0; c < 3; c++) bucket.rgb[c]! += values[c]!;
    } else buckets.set(key, { count: 1, rgb: [...values] });
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  if (!ranked.length)
    return { cardBackgroundColor: "#243047", accentColor: "#60a5fa" };
  const colors = ranked.map((b) => ({
    count: b.count,
    rgb: b.rgb.map((n) => n / b.count),
  }));
  const dominant = colors[0]!.rgb;
  const vibrant = colors.reduce((best, next) => {
    const score = (c: typeof best) =>
      Math.sqrt(c.count) * (Math.max(...c.rgb) - Math.min(...c.rgb) + 16);
    return score(next) > score(best) ? next : best;
  }).rgb;
  return {
    cardBackgroundColor: hex(dominant.map((n) => 12 + n * 0.2)),
    accentColor: hex(vibrant.map((n) => 90 + n * 0.65)),
  };
}

export function getProjectCardStyle(
  project: ProjectColors | undefined,
): CSSProperties | undefined {
  if (!project) return undefined;
  const background = valid(project.cardBackgroundColor)
    ? project.cardBackgroundColor
    : undefined;
  const accent = valid(project.accentColor) ? project.accentColor : undefined;
  if (!background && !accent) return undefined;
  const style: CSSProperties & Record<string, string | undefined> = {};
  if (background) {
    const linear = rgb(background).map((n) =>
      n / 255 <= 0.04045 ? n / 255 / 12.92 : ((n / 255 + 0.055) / 1.055) ** 2.4,
    );
    const light =
      linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722 > 0.179;
    style.backgroundColor = background;
    style["--color-panel"] = background;
    style["--color-panel-hover"] =
      `color-mix(in srgb, ${background} 88%, ${light ? "black" : "white"})`;
    style["--color-panel-tinted"] =
      `color-mix(in srgb, ${background} 90%, black)`;
    style["--color-content"] = light ? "#111827" : "#f8fafc";
    style["--color-content-tinted"] = light ? "#334155" : "#cbd5e1";
    style.color = "var(--color-content)";
  }
  if (accent) {
    style["--color-accent"] = accent;
    style.borderLeftColor = accent;
    style.borderLeftWidth = "3px";
    style.borderLeftStyle = "solid";
  }
  return style;
}
