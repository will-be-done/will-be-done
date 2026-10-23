export {}

interface ServerCheckResult {
  ok: boolean
  serverUrl: string
  error?: string
  offline?: boolean
  status?: number
}

interface DesktopAPI {
  runGoogleAuth(url: string): Promise<string | null>
  getServerUrl(): Promise<string>
  checkServerUrl(url?: string): Promise<ServerCheckResult>
  setServerUrl(url: string): Promise<void>
  resetServerUrl(): Promise<void>
  closePopup(): void
  onPopupShow(callback: () => void): () => void
}

declare global {
  interface Window {
    api?: DesktopAPI
    desktopApi?: DesktopAPI
  }
}
