// The bridge the desktop app's preload exposes as window.desktopApi. The web
// app loads in desktop builds of any age, so it uses InstalledDesktopAPI.

export type ServerCheckResult =
  | { ok: true; serverUrl: string }
  | {
      ok: false;
      serverUrl: string;
      error: string;
      offline?: boolean;
      status?: number;
    };

export type EditHistoryCommand = "undo" | "redo";

export interface DesktopAPI {
  runGoogleAuth(url: string): Promise<string | null>;
  cancelGoogleAuth(flowId: string): Promise<void>;
  getServerUrl(): Promise<string>;
  checkServerUrl(url?: string): Promise<ServerCheckResult>;
  setServerUrl(url: string): Promise<void>;
  resetServerUrl(): Promise<void>;
  closePopup(): void;
  onPopupShow(callback: () => void): () => void;
  // Returns true when the page handled the command; otherwise the focused
  // text field gets the native undo or redo.
  onEditHistory(handler: (command: EditHistoryCommand) => boolean): () => void;
}

// Methods added after the first desktop release.
type AddedLaterMethods = "runGoogleAuth" | "cancelGoogleAuth" | "onEditHistory";

export type InstalledDesktopAPI = Omit<DesktopAPI, AddedLaterMethods> &
  Partial<Pick<DesktopAPI, AddedLaterMethods>>;
