import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getServerUrl: (): Promise<string | null> => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url: string): Promise<void> => ipcRenderer.invoke('set-server-url', url),
  clearServerUrl: (): Promise<void> => ipcRenderer.invoke('clear-server-url')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
