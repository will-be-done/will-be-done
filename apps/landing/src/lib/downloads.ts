/**
 * The desktop packages offered on /download/. The links themselves live in
 * `src/data/desktop-downloads.json`, which `scripts/sync-downloads.ts`
 * regenerates from the latest GitHub release; this file says which release
 * asset is which package.
 *
 * No runtime dependencies here: the script imports this file directly under
 * Node's type stripping, so it must not reach for `astro:*`.
 */

export type Platform = "mac" | "windows" | "linux";

export interface DownloadFormat {
  id: string;
  platform: Platform;
  /** Button label, e.g. "AppImage". */
  label: string;
  /** One line under the label saying who the package is for. */
  hint: string;
  /** Matches the electron-builder artifact name in `apps/desktop/electron-builder.yml`. */
  match: (assetName: string) => boolean;
}

/** In display order. A platform with a single format gets the big button on /download/. */
export const DOWNLOAD_FORMATS: DownloadFormat[] = [
  {
    id: "mac-dmg",
    platform: "mac",
    label: "Disk image (.dmg)",
    hint: "Apple silicon and Intel",
    match: (name) => name.endsWith(".dmg"),
  },
  {
    id: "windows-exe",
    platform: "windows",
    label: "Installer (.exe)",
    hint: "Windows 10 and 11, 64-bit",
    match: (name) => name.endsWith("-setup.exe"),
  },
  {
    id: "linux-appimage",
    platform: "linux",
    label: "AppImage",
    hint: "Runs on any distribution",
    match: (name) => name.endsWith(".AppImage"),
  },
  {
    id: "linux-deb",
    platform: "linux",
    label: "Debian package (.deb)",
    hint: "Debian, Ubuntu, Mint",
    match: (name) => name.endsWith("_amd64.deb"),
  },
  {
    id: "linux-rpm",
    platform: "linux",
    label: "RPM package (.rpm)",
    hint: "Fedora, openSUSE, RHEL",
    match: (name) => name.endsWith(".x86_64.rpm"),
  },
  {
    id: "linux-flatpak",
    platform: "linux",
    label: "Flatpak bundle (.flatpak)",
    hint: "Sandboxed, any distribution",
    match: (name) => name.endsWith(".flatpak"),
  },
  {
    id: "linux-snap",
    platform: "linux",
    label: "Snap package (.snap)",
    hint: "Install with snap --dangerous",
    match: (name) => name.endsWith("_amd64.snap"),
  },
];

export interface DownloadFile {
  name: string;
  url: string;
  size: number;
}

/** Shape of `src/data/desktop-downloads.json`. */
export interface DesktopDownloads {
  tag: string;
  version: string;
  publishedAt: string;
  /** The GitHub release page, for when the landing release page is not merged yet. */
  releaseUrl: string;
  /** Keyed by `DownloadFormat.id`. */
  files: Record<string, DownloadFile>;
}
