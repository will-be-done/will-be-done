import { ElectronAPI } from '@electron-toolkit/preload'

interface DesktopAPI {
  getServerUrl(): Promise<string>
  setServerUrl(url: string): Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    desktopApi?: DesktopAPI
  }
}
