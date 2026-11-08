/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

import type { InstalledDesktopAPI } from "@will-be-done/slices/desktop";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SENTRY_DSN?: string;
    readonly VITE_SENTRY_RELEASE?: string;
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
    readonly VITE_POSTHOG_UI_HOST?: string;
    readonly VITE_DEMO_MODE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    api?: InstalledDesktopAPI;
    desktopApi?: InstalledDesktopAPI;
  }
}
