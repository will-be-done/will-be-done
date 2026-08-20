import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getReleases, releasePath } from "../../lib/releases";

export const GET: APIRoute = async (context) => {
  const releases = await getReleases();

  return rss({
    title: "Will Be Done releases",
    description:
      "New versions of Will Be Done, the open source, local-first task manager built around a weekly timeline.",
    site: context.site ?? "https://will-be-done.app",
    items: releases.map((release) => ({
      title: `Will Be Done ${release.data.tag}: ${release.data.headline}`,
      description: release.data.summary,
      pubDate: release.data.publishedAt,
      link: releasePath(release.data.tag),
    })),
    customData: "<language>en</language>",
  });
};
