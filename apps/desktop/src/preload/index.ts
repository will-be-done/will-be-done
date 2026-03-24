import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url: string): Promise<void> => ipcRenderer.invoke('set-server-url', url),
  closePopup: (): void => ipcRenderer.send('close-popup'),
  onPopupShow: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('popup-show', listener)
    return () => ipcRenderer.removeListener('popup-show', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('desktopApi', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.desktopApi = api
}
