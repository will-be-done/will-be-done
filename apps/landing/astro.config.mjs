// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import rehypeExternalLinks from "rehype-external-links";

// https://astro.build/config
export default defineConfig({
  site: "https://will-be-done.app",
  integrations: [sitemap()],
  markdown: {
    // Release notes are imported from GitHub and link out to PRs and issues.
    rehypePlugins: [
      [
        rehypeExternalLinks,
        { target: "_blank", rel: ["noopener", "noreferrer"] },
      ],
    ],
  },
  vite: {
    // @ts-ignore - version mismatch between @tailwindcss/vite and astro's bundled vite types
    plugins: [tailwindcss()],
  },
});
