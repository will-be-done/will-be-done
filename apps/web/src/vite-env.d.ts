/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

export {};

interface ServerCheckResult {
  ok: boolean;
  serverUrl: string;
  error?: string;
  offline?: boolean;
  status?: number;
}

interface DesktopAPI {
  getServerUrl(): Promise<string>;
  checkServerUrl(url?: string): Promise<ServerCheckResult>;
  setServerUrl(url: string): Promise<void>;
  resetServerUrl(): Promise<void>;
  closePopup(): void;
  onPopupShow(callback: () => void): () => void;
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_SENTRY_DSN?: string;
    readonly VITE_SENTRY_RELEASE?: string;
    readonly VITE_POSTHOG_KEY?: string;
    readonly VITE_POSTHOG_HOST?: string;
    readonly VITE_POSTHOG_UI_HOST?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    api?: DesktopAPI;
    desktopApi?: DesktopAPI;
  }
}
