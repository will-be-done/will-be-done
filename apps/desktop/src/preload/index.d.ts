import { ElectronAPI } from '@electron-toolkit/preload'

interface DesktopAPI {
  getServerUrl(): Promise<string | null>
  setServerUrl(url: string): Promise<void>
  clearServerUrl(): Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopAPI
  }
}
