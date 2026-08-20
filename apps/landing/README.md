# Landing site

The marketing site at [will-be-done.app](https://will-be-done.app). Astro, Tailwind v4, statically
built and deployed to Cloudflare Pages by `.github/workflows/deploy-landing.yaml`.

## Commands

| Command              | Action                                          |
| :------------------- | :---------------------------------------------- |
| `pnpm dev`           | Dev server on http://localhost:4321             |
| `pnpm build`         | Static build to `./dist/`                       |
| `pnpm preview`       | Serve the built site locally                    |
| `pnpm sync:releases` | Pull GitHub releases into release pages (below) |

## Pages

- `src/pages/index.astro` — the landing page.
- `src/pages/releases/index.astro` — the release overview.
- `src/pages/releases/[tag].astro` — one page per release.
- `src/pages/releases/rss.xml.ts` — release feed.

`src/layouts/Layout.astro` owns the `<head>`: title, description, canonical, Open Graph and the
schema.org graph. Pages pass `path` so the canonical and `og:url` are right, and can pass extra
schema nodes through the `schema` prop. `@astrojs/sitemap` generates `/sitemap-index.xml`, which
`public/robots.txt` points at.

## Release pages

Each release lives in `src/content/releases/<tag>.md`, with its images in
`src/assets/releases/<tag>/`. The frontmatter drives the overview page, the meta tags and the
structured data; the markdown body is the release notes themselves.

`pnpm sync:releases` reads the GitHub releases with the `gh` CLI and generates the files for any
release that does not have one yet:

```sh
pnpm sync:releases                 # add releases that are missing
pnpm sync:releases --force         # regenerate everything, overwriting edits
pnpm sync:releases --images-only   # re-download images, keep the prose
pnpm sync:releases --tag v0.10.1   # only this release
```

It downloads the images a release body references, converts them to webp at the width the release
author asked for, and rewrites the body to point at the local copies — so the images are served
from our domain and optimised by Astro instead of hotlinked from GitHub. Downloads are staged and
swapped in at the end, so a failure never leaves the assets out of step with the markdown.

`--images-only` refuses to run when a release body has gained, lost or reordered an image upstream,
because the numbering would have moved and the hand-edited markdown would end up pointing at the
wrong pictures. Regenerate that release with `--force --tag <tag>` instead.

A release tag has to be a single safe path segment — it is both the file name and the URL segment.
Tags that are not (one containing `/`, say) are skipped with a warning; the rule lives in
`src/lib/releaseTag.ts` and the content schema enforces the same one.

**The generated `headline`, `summary` and `highlights` are a starting point.** They become the
`<h1>`, the meta description and the at-a-glance list, so they are worth rewriting by hand. The
script never touches a file that already exists unless you pass `--force`.

`.github/workflows/sync-release-pages.yaml` runs the script when a release is published and opens
a pull request with the result, so the copy gets reviewed before it goes live. It works on one
long-lived `release-pages/pending` branch: a release published while an earlier pull request is
still open adds to that pull request rather than opening a second one that repeats it.
