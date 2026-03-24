/// <reference types="vite/client" />

export {};

interface DesktopAPI {
  getServerUrl(): Promise<string>;
  setServerUrl(url: string): Promise<void>;
  closePopup(): void;
  onPopupShow(callback: () => void): () => void;
}

declare global {
  interface Window {
    desktopApi?: DesktopAPI;
  }
}
