import { contextBridge, ipcRenderer } from 'electron'

type EditHistoryCommand = 'undo' | 'redo'
type EditHistoryHandler = (command: EditHistoryCommand) => boolean

let editHistoryHandler: EditHistoryHandler | null = null

ipcRenderer.on('edit-history', (_event, command: EditHistoryCommand) => {
  if (editHistoryHandler?.(command)) return
  ipcRenderer.send('native-edit-history', command)
})

const api = {
  runGoogleAuth: (url: string): Promise<string | null> =>
    ipcRenderer.invoke('run-google-auth', url),
  cancelGoogleAuth: (flowId: string): Promise<void> =>
    ipcRenderer.invoke('cancel-google-auth', flowId),
  getServerUrl: (): Promise<string> => ipcRenderer.invoke('get-server-url'),
  checkServerUrl: (url?: string): Promise<unknown> => ipcRenderer.invoke('check-server-url', url),
  setServerUrl: (url: string): Promise<void> => ipcRenderer.invoke('set-server-url', url),
  resetServerUrl: (): Promise<void> => ipcRenderer.invoke('reset-server-url'),
  closePopup: (): void => ipcRenderer.send('close-popup'),
  onPopupShow: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('popup-show', listener)
    return () => ipcRenderer.removeListener('popup-show', listener)
  },
  // The handler returns true when it handled the command; otherwise the
  // focused text field gets the native undo or redo.
  onEditHistory: (handler: EditHistoryHandler): (() => void) => {
    editHistoryHandler = handler
    return () => {
      if (editHistoryHandler === handler) editHistoryHandler = null
    }
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
