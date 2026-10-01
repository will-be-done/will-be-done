// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import rehypeExternalLinks from "rehype-external-links";

const repoUrl = "https://github.com/will-be-done/will-be-done";

// https://astro.build/config
export default defineConfig({
  site: "https://will-be-done.app",
  integrations: [
    sitemap(),
    starlight({
      title: "Will Be Done",
      titleDelimiter: "·",
      description:
        "Documentation for Will Be Done, the open source, local-first task manager built around a visual weekly timeline.",
      favicon: "/favicon.svg",
      // The site is dark only and has its own chrome, so Starlight's theme is
      // re-skinned in CSS and its header/footer are swapped for the site's.
      customCss: ["./src/styles/starlight.css"],
      components: {
        Head: "./src/components/starlight/Head.astro",
        SiteTitle: "./src/components/starlight/SiteTitle.astro",
        SocialIcons: "./src/components/starlight/SocialIcons.astro",
        ThemeSelect: "./src/components/starlight/ThemeSelect.astro",
        Footer: "./src/components/starlight/Footer.astro",
      },
      expressiveCode: {
        // A single theme: without the theme picker there is nothing to switch to.
        themes: ["github-dark"],
        styleOverrides: {
          borderRadius: "0.75rem",
          borderColor: "rgba(255, 255, 255, 0.06)",
          codeBackground: "rgba(255, 255, 255, 0.03)",
          frames: { editorTabBarBackground: "rgba(255, 255, 255, 0.02)" },
        },
      },
      editLink: { baseUrl: `${repoUrl}/edit/main/apps/landing/` },
      // Starlight's 404 renders with the docs chrome; the rest of the site is
      // not a docs site, so it should not own the site-wide 404.
      disable404Route: true,
      sidebar: [
        { label: "Documentation", autogenerate: { directory: "docs" } },
      ],
    }),
  ],
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
