import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('get-server-url'),
  checkServerUrl: (url?: string): Promise<unknown> => ipcRenderer.invoke('check-server-url', url),
  setServerUrl: (url: string): Promise<void> => ipcRenderer.invoke('set-server-url', url),
  resetServerUrl: (): Promise<void> => ipcRenderer.invoke('reset-server-url'),
  closePopup: (): void => ipcRenderer.send('close-popup'),
  onPopupShow: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('popup-show', listener)
    return () => ipcRenderer.removeListener('popup-show', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('desktopApi', api)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.desktopApi = api
  // @ts-ignore (define in dts)
  window.api = api
}
