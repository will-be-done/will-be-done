/**
 * Points the /download/ page at the latest GitHub release.
 *
 * Reads the release GitHub marks as latest (never a draft or a prerelease),
 * matches its assets to the packages in `src/lib/downloads.ts` and writes
 * `src/data/desktop-downloads.json`. Every download link on the site is built
 * from that file, so this is the only thing a release has to change.
 *
 *   node scripts/sync-downloads.ts
 *
 * Fails without writing anything if the release is missing a package, so the
 * page never loses a button because one build did not upload.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  DOWNLOAD_FORMATS,
  type DesktopDownloads,
  type DownloadFile,
} from "../src/lib/downloads.ts";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  scriptDir,
  "../src/data/desktop-downloads.json",
);

const REPO = "will-be-done/will-be-done";

interface ReleaseView {
  tagName: string;
  publishedAt: string;
  url: string;
  assets: { name: string; url: string; size: number }[];
}

async function main(): Promise<void> {
  // Without a tag, `gh release view` returns the release marked as latest.
  const { stdout } = await execFileAsync("gh", [
    "release",
    "view",
    "--repo",
    REPO,
    "--json",
    "tagName,publishedAt,url,assets",
  ]);
  const release = JSON.parse(stdout) as ReleaseView;

  const files: Record<string, DownloadFile> = {};
  const missing: string[] = [];

  for (const format of DOWNLOAD_FORMATS) {
    const matches = release.assets.filter((asset) => format.match(asset.name));
    if (matches.length !== 1) {
      missing.push(
        `${format.id}: expected one asset, found ${matches.length}` +
          (matches.length > 0
            ? ` (${matches.map((a) => a.name).join(", ")})`
            : ""),
      );
      continue;
    }

    const [asset] = matches;
    files[format.id] = { name: asset.name, url: asset.url, size: asset.size };
  }

  if (missing.length > 0) {
    throw new Error(
      `Release ${release.tagName} does not have every desktop package:\n  ` +
        missing.join("\n  "),
    );
  }

  const downloads: DesktopDownloads = {
    tag: release.tagName,
    version: release.tagName.replace(/^v/, ""),
    publishedAt: release.publishedAt,
    releaseUrl: release.url,
    files,
  };

  await writeFile(outputPath, `${JSON.stringify(downloads, null, 2)}\n`);
  console.log(
    `Wrote ${path.relative(process.cwd(), outputPath)} for ${release.tagName}.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
