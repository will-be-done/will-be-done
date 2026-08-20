/**
 * Turns GitHub releases into pages on the landing site.
 *
 * For every release that does not have a file in `src/content/releases` yet, this
 * writes one markdown file with frontmatter and downloads the images the release
 * body references into `src/assets/releases/<tag>/`, so the images are served from
 * our own domain and optimised by Astro instead of hotlinked from GitHub.
 *
 * Existing files are left alone, because the generated summary and headings are
 * meant to be hand-polished for search afterwards. Use `--force` to regenerate.
 *
 *   node scripts/sync-releases.ts                 # add releases that are missing
 *   node scripts/sync-releases.ts --force         # regenerate everything
 *   node scripts/sync-releases.ts --images-only   # re-download images, keep the prose
 *   node scripts/sync-releases.ts --tag v0.10.1   # only this one
 *   node scripts/sync-releases.ts --limit 5
 */

import { execFile } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const landingDir = path.resolve(scriptDir, "..");
const contentDir = path.join(landingDir, "src/content/releases");
const assetsDir = path.join(landingDir, "src/assets/releases");

const REPO = "will-be-done/will-be-done";

interface ReleaseListItem {
  tagName: string;
  name: string;
  publishedAt: string;
  isDraft: boolean;
  isPrerelease: boolean;
}

interface ReleaseDetail {
  tagName: string;
  name: string;
  publishedAt: string;
  body: string;
  url: string;
  isDraft: boolean;
  isPrerelease: boolean;
}

interface Args {
  force: boolean;
  imagesOnly: boolean;
  limit: number;
  tag?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, imagesOnly: false, limit: 100 };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") args.force = true;
    else if (arg === "--images-only") args.imagesOnly = true;
    else if (arg === "--tag") args.tag = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive number");
  }

  return args;
}

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `\`gh ${args.join(" ")}\` failed. Is the GitHub CLI installed and authenticated (\`gh auth login\`)?\n${message}`,
    );
  }
}

async function listReleases(limit: number): Promise<ReleaseListItem[]> {
  const stdout = await gh([
    "release",
    "list",
    "--repo",
    REPO,
    "--limit",
    String(limit),
    "--json",
    "tagName,name,publishedAt,isDraft,isPrerelease",
  ]);

  return (JSON.parse(stdout) as ReleaseListItem[]).filter(
    (release) => !release.isDraft,
  );
}

async function viewRelease(tag: string): Promise<ReleaseDetail> {
  const stdout = await gh([
    "release",
    "view",
    tag,
    "--repo",
    REPO,
    "--json",
    "tagName,name,publishedAt,body,url,isDraft,isPrerelease",
  ]);

  return JSON.parse(stdout) as ReleaseDetail;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * `<img src="..." alt="...">` — GitHub rewrites pasted screenshots into raw HTML
 * rather than markdown, so both shapes have to be handled.
 */
const HTML_IMAGE_RE = /<img\b[^>]*?>/gi;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const ATTRIBUTE_RE = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE_RE)) {
    attributes[match[1].toLowerCase()] = match[2];
  }
  return attributes;
}

/**
 * "image", "image.png" and "Screenshot 2026-03-24 at 21 17 53" are what GitHub
 * fills in by default. They say nothing to a reader or to a crawler, so they get
 * replaced with something describing the release.
 */
function isPlaceholderAlt(alt: string): boolean {
  const trimmed = alt.trim();
  if (trimmed === "") return true;
  return /^(image|screenshot|img|picture)\b/i.test(trimmed);
}

/** Screenshots wider than this carry no extra detail on the page. */
const MAX_IMAGE_WIDTH = 1600;

/**
 * Markdown images cannot carry a width, so the stored file's own width is what
 * decides how large the image renders (the page styles it as `width: auto`).
 * Resizing to the width the release author put on the `<img>` therefore
 * reproduces the layout they intended on GitHub.
 */
async function downloadImage(
  url: string,
  targetBase: string,
  displayWidth?: number,
): Promise<string> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  const mime = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extension = EXTENSION_BY_MIME[mime];
  if (!extension) {
    throw new Error(`Unsupported image type "${mime}" for ${url}`);
  }

  const source = Buffer.from(await response.arrayBuffer());

  // GitHub serves retina-sized PNG screenshots, which are megabytes each. Store
  // webp instead so the repo stays small; Astro still derives its own sizes from
  // this file at build time. Animations and vectors are kept as-is.
  if (extension === "png" || extension === "jpg") {
    const filePath = `${targetBase}.webp`;
    const width = Math.min(displayWidth ?? MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH);
    await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(filePath);
    return filePath;
  }

  const filePath = `${targetBase}.${extension}`;
  await writeFile(filePath, source);

  return filePath;
}

interface RewriteResult {
  body: string;
  imageCount: number;
}

/**
 * Downloads every remote image in the body and points the markdown at the local
 * copy, so Astro can emit responsive, optimised images at build time.
 */
async function localiseImages(
  body: string,
  release: ReleaseDetail,
): Promise<RewriteResult> {
  const releaseAssetsDir = path.join(assetsDir, release.tagName);
  const found: {
    placeholder: string;
    alt: string;
    url: string;
    width?: number;
  }[] = [];

  let index = 0;
  const withPlaceholders = body
    .replace(HTML_IMAGE_RE, (tag) => {
      const attributes = parseAttributes(tag);
      const url = attributes.src;
      if (!url || !/^https?:\/\//.test(url)) return tag;

      const width = Number(attributes.width);
      const placeholder = `@@IMAGE_${index++}@@`;
      found.push({
        placeholder,
        alt: attributes.alt ?? "",
        url,
        width: Number.isFinite(width) && width > 0 ? width : undefined,
      });
      return placeholder;
    })
    .replace(MARKDOWN_IMAGE_RE, (_match, alt: string, url: string) => {
      const placeholder = `@@IMAGE_${index++}@@`;
      found.push({ placeholder, alt, url });
      return placeholder;
    });

  if (found.length === 0) return { body: withPlaceholders, imageCount: 0 };

  await rm(releaseAssetsDir, { recursive: true, force: true });
  await mkdir(releaseAssetsDir, { recursive: true });

  let result = withPlaceholders;

  for (const [position, image] of found.entries()) {
    const number = position + 1;
    const filePath = await downloadImage(
      image.url,
      path.join(releaseAssetsDir, String(number)),
      image.width,
    );
    const relativePath = path
      .relative(contentDir, filePath)
      .split(path.sep)
      .join("/");

    const alt = isPlaceholderAlt(image.alt)
      ? `Will Be Done ${release.tagName} screenshot ${number}`
      : image.alt.trim();

    result = result.replace(
      image.placeholder,
      `![${escapeMarkdown(alt)}](${relativePath})`,
    );
  }

  return { body: result, imageCount: found.length };
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\[\]])/g, "\\$1");
}

const FULL_CHANGELOG_RE = /^\s*\*\*Full Changelog\*\*:\s*(\S+)\s*$/gim;
const PR_ATTRIBUTED_RE =
  /\s+by\s+@[\w-]+\s+in\s+(https:\/\/github\.com\/\S+?\/pull\/(\d+))\b/g;
const PR_IN_RE = /\s+in\s+(https:\/\/github\.com\/\S+?\/pull\/(\d+))\b/g;
const PR_BARE_RE =
  /(?<!\]\()(?<!\/)\bhttps:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+)\b(?!\))/g;

/**
 * Release bodies are written for the GitHub releases UI, which autolinks bare
 * URLs and renders a trailing compare link. On a page of our own those read as
 * naked URLs, so they become real links and frontmatter instead.
 */
function normaliseBody(body: string): { body: string; compareUrl?: string } {
  let compareUrl: string | undefined;

  let result = body
    .replace(FULL_CHANGELOG_RE, (_match, url: string) => {
      compareUrl = url;
      return "";
    })
    .replace(PR_ATTRIBUTED_RE, " ([#$2]($1))")
    .replace(PR_IN_RE, " ([#$2]($1))")
    .replace(PR_BARE_RE, (url, number: string) => `[#${number}](${url})`);

  // Images that sit directly under a bullet need a blank line on both sides,
  // otherwise markdown swallows them into the preceding list item.
  result = result.replace(/([^\n])\n(!\[[^\]]*\]\([^)]+\))/g, "$1\n\n$2");
  result = result.replace(/(!\[[^\]]*\]\([^)]+\))\n([^\n])/g, "$1\n\n$2");

  return { body: result.replace(/\n{3,}/g, "\n\n").trim(), compareUrl };
}

const BULLET_RE = /^[-*]\s+(.+)$/;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHighlights(body: string): string[] {
  const highlights: string[] = [];

  for (const line of body.split("\n")) {
    const match = BULLET_RE.exec(line.trim());
    if (!match) continue;

    const text = stripInlineMarkdown(match[1]).replace(/\s*\(#\d+\)\s*$/, "");
    if (text.length > 0) highlights.push(text);
    if (highlights.length >= 6) break;
  }

  return highlights;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : cut.length).trimEnd()}…`;
}

function buildSummary(body: string, highlights: string[], tag: string): string {
  const paragraph = body
    .split("\n\n")
    .map((block) => block.trim())
    .find(
      (block) =>
        block.length > 0 &&
        !block.startsWith("#") &&
        !BULLET_RE.test(block) &&
        !block.startsWith("!["),
    );

  if (paragraph) return truncate(stripInlineMarkdown(paragraph), 155);
  if (highlights.length > 0)
    return truncate(highlights.slice(0, 2).join(" "), 155);

  return `Will Be Done ${tag}. See the release notes for what changed.`;
}

/** "0.7.0 - desktop app support with quick add" carries a headline; "v0.10.1" does not. */
function buildHeadline(
  name: string,
  tag: string,
  highlights: string[],
): string {
  const separator = name.match(/\s+[-–—]\s+(.+)$/);
  if (separator) {
    const headline = separator[1].trim();
    return headline.charAt(0).toUpperCase() + headline.slice(1);
  }

  if (highlights.length > 0) return truncate(highlights[0], 70);

  return `Will Be Done ${tag}`;
}

function yamlString(value: string): string {
  // A JSON string literal is always a valid YAML double-quoted scalar.
  return JSON.stringify(value);
}

function renderFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlString(String(item))}`);
      continue;
    }

    if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
      continue;
    }

    lines.push(`${key}: ${yamlString(String(value))}`);
  }

  lines.push("---");
  return lines.join("\n");
}

async function writeRelease(
  release: ReleaseDetail,
  imagesOnly: boolean,
): Promise<void> {
  // Images are localised first so that `normaliseBody` sees markdown images and
  // can give them the blank lines they need to render as their own block.
  const raw = (release.body ?? "").replace(/\r\n/g, "\n");
  const { body: localised, imageCount } = await localiseImages(raw, release);
  const { body, compareUrl } = normaliseBody(localised);

  if (imagesOnly) {
    console.log(
      `  refreshed ${imageCount} image${imageCount === 1 ? "" : "s"}`,
    );
    return;
  }

  const highlights = extractHighlights(body);
  const summary = buildSummary(body, highlights, release.tagName);
  const headline = buildHeadline(
    release.name ?? release.tagName,
    release.tagName,
    highlights,
  );

  const frontmatter = renderFrontmatter({
    tag: release.tagName,
    version: release.tagName.replace(/^v/, ""),
    headline,
    summary,
    highlights,
    publishedAt: new Date(release.publishedAt).toISOString(),
    githubUrl: release.url,
    compareUrl,
    prerelease: release.isPrerelease,
  });

  const filePath = path.join(contentDir, `${release.tagName}.md`);
  await writeFile(filePath, `${frontmatter}\n\n${body}\n`);

  console.log(
    `  wrote ${path.relative(landingDir, filePath)}` +
      (imageCount > 0
        ? ` (+${imageCount} image${imageCount === 1 ? "" : "s"})`
        : ""),
  );
}

async function existingTags(): Promise<Set<string>> {
  if (!existsSync(contentDir)) return new Set();

  const files = await readdir(contentDir);
  return new Set(
    files
      .filter((file) => file.endsWith(".md"))
      .map((file) => file.replace(/\.md$/, "")),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  await mkdir(contentDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const existing = await existingTags();
  const releases = await listReleases(args.limit);

  const selected = args.tag
    ? releases.filter((release) => release.tagName === args.tag)
    : releases;

  if (args.tag && selected.length === 0) {
    throw new Error(`No published release found for tag ${args.tag}`);
  }

  const targets = selected.filter(
    (release) =>
      args.force ||
      args.imagesOnly ||
      args.tag ||
      !existing.has(release.tagName),
  );

  if (targets.length === 0) {
    console.log(
      `Up to date: ${existing.size} release page(s), nothing new on GitHub.`,
    );
    return;
  }

  console.log(`Syncing ${targets.length} release(s)…`);

  for (const release of targets) {
    console.log(`- ${release.tagName}`);
    await writeRelease(await viewRelease(release.tagName), args.imagesOnly);
  }

  if (args.imagesOnly) {
    console.log(
      "\nDone. Images were re-downloaded; the markdown was left untouched.",
    );
    return;
  }

  console.log(
    "\nDone. Generated summaries and headlines are a starting point — review the new " +
      "frontmatter before publishing. Re-running without --force will not touch these files again.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
