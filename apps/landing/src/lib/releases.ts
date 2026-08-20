import { getCollection, type CollectionEntry } from "astro:content";

export type Release = CollectionEntry<"releases">;

/** Newest first, which is the order every release view uses. */
export async function getReleases(): Promise<Release[]> {
  const releases = await getCollection("releases");

  return releases.sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}

export function releasePath(tag: string): string {
  return `/releases/${tag}/`;
}

const longDate = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(date: Date): string {
  return longDate.format(date);
}

/** `datetime` attribute for <time>: date only, since releases are day-granular here. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
