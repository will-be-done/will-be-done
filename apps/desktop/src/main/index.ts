import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  globalShortcut,
  screen,
  nativeImage
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import ElectronStore from 'electron-store'

app.setName('Will Be Done')

if (is.dev) {
  app.setName('Will Be Done Dev')
}

if (is.dev) {
  // Let's make separate app data folder for development
  // It will allow to run both production and development versions of the app
  // at the same time + fix potential syncing issue(cause dev version points to dev server)
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

const gotTheLock = app.requestSingleInstanceLock()

if (!is.dev) {
  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      // Someone tried to run a second instance, we should focus our window.
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()

        mainWindow.focus()
      }
    })

    // Note: Windows only
    if (process.platform === 'win32') {
      app.setAppUserModelId(app.name)
    }
  }
}

const serverUrlKey = 'serverUrl'

// electron-store v11 is ESM; electron-vite compiles main as CJS, so default export may be wrapped
const Store =
  (ElectronStore as unknown as { default: typeof ElectronStore }).default || ElectronStore
const store = new Store<{ serverUrl?: string }>()

const DEFAULT_SERVER = 'https://app.will-be-done.app'
const LOCAL_SHELL_URL = 'http://localhost:5173'
const SERVER_CHECK_TIMEOUT_MS = 5000

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null

function getServerUrl(): string {
  if (is.dev) {
    return LOCAL_SHELL_URL
  }

  return (store.get(serverUrlKey) as string | undefined) || DEFAULT_SERVER
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function normalizeServerUrl(url: string): string {
  const normalized = new URL(url.trim())
  if (!isHttpUrl(normalized.toString())) {
    throw new Error('Server URL must use http:// or https://')
  }

  normalized.hash = ''
  return normalized.toString().replace(/\/$/, '')
}

function getServerCheckUrl(serverUrl: string): string {
  return new URL('/check.json', `${serverUrl}/`).toString()
}

async function checkServerUrl(
  serverUrl: string
): Promise<
  | { ok: true; serverUrl: string }
  | { ok: false; serverUrl: string; error: string; offline?: boolean; status?: number }
> {
  let normalizedUrl = serverUrl.trim()

  try {
    normalizedUrl = normalizeServerUrl(serverUrl)
    const checkUrl = getServerCheckUrl(normalizedUrl)
    const response = await fetch(checkUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(SERVER_CHECK_TIMEOUT_MS)
    })

    if (!response.ok) {
      const error =
        response.status === 404
          ? `Could not load ${checkUrl}. This server is missing check.json.`
          : `Failed to load ${checkUrl}. Server responded with status ${response.status}.`

      return {
        ok: false,
        serverUrl: normalizedUrl,
        status: response.status,
        error
      }
    }

    await response.json()

    return { ok: true, serverUrl: normalizedUrl }
  } catch (error) {
    const checkUrl = isHttpUrl(normalizedUrl) ? getServerCheckUrl(normalizedUrl) : normalizedUrl
    let message = error instanceof Error ? error.message : 'Failed to verify the configured server.'
    const offline =
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.message.includes('fetch failed') ||
        error.message.includes('network') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED'))

    if (error instanceof Error && error.name === 'TimeoutError') {
      message = `Timed out while loading ${checkUrl}.`
    } else if (offline) {
      message = `Could not reach ${checkUrl}. Check the server address and your connection.`
    }

    return {
      ok: false,
      serverUrl: normalizedUrl,
      error: message,
      offline
    }
  }
}

function loadLocalMainWindow(mode: 'setup' | 'recovery', failedUrl?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const query = new URLSearchParams({ mode })
  if (failedUrl) {
    query.set('failedUrl', failedUrl)
  }

  if (is.dev) {
    void mainWindow.loadURL(`${getServerUrl()}?${query.toString()}`)
    return
  }

  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
    query: Object.fromEntries(query.entries())
  })
}

function loadRemoteMainWindow(url: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  void mainWindow.loadURL(url)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 400,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (event, _errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || !validatedURL || !isHttpUrl(validatedURL)) return

      event.preventDefault()
      loadLocalMainWindow('recovery', validatedURL)
    }
  )

  loadRemoteMainWindow(getServerUrl())

  buildMenu()
}

const POPUP_WIDTH = 500
const POPUP_HEIGHT = 160

function initPopupWindow(): void {
  popupWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    // NSPanel-like behavior: appears on the current Space without activating
    // the app or switching desktops (like Spotlight/Alfred)
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : { alwaysOnTop: true }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  popupWindow.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
  popupWindow.setAlwaysOnTop(true, 'pop-up-menu')

  const popupUrl = `${getServerUrl()}/popup`
  popupWindow.loadURL(popupUrl)

  popupWindow.on('blur', () => {
    hidePopup()
  })

  // If the window is somehow destroyed, recreate it
  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

function showPopup(): void {
  if (!popupWindow || popupWindow.isDestroyed()) {
    initPopupWindow()
    // First open: wait for ready-to-show
    popupWindow!.on('ready-to-show', () => {
      positionAndShowPopup()
    })
    return
  }

  positionAndShowPopup()
}

function positionAndShowPopup(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return

  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: dx, y: dy, width: dw, height: dh } = activeDisplay.workArea

  popupWindow.setPosition(Math.round(dx + dw / 2 - POPUP_WIDTH / 2), Math.round(dy + dh / 3))

  popupWindow.webContents.send('popup-show')
  popupWindow.showInactive()
}

function hidePopup(): void {
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide()
  }
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              // { role: 'about' as const },
              // { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        // { role: 'reload' },
        // { role: 'forceReload' },
        // { role: 'toggleDevTools' },
        // { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(app.name)

  // Set dock icon on macOS (needed for dev mode)
  if (process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(icon))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: close/hide popup window
  ipcMain.on('close-popup', () => {
    hidePopup()
  })

  // Global shortcut for quick-add task
  globalShortcut.register('CmdOrCtrl+Shift+A', () => {
    showPopup()
  })

  globalShortcut.register('CommandOrControl+Alt+I', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    focusedWindow?.webContents.toggleDevTools()
  })

  // IPC: get/set server URL, reload window to new server
  ipcMain.handle('get-server-url', () => {
    return getServerUrl()
  })

  ipcMain.handle('check-server-url', async (_event, url?: string) => {
    return checkServerUrl(url || getServerUrl())
  })

  ipcMain.handle('set-server-url', async (_event, url: string) => {
    const checkResult = await checkServerUrl(url)
    if (!checkResult.ok) {
      throw new Error(checkResult.error)
    }

    store.set(serverUrlKey, checkResult.serverUrl)
    if (mainWindow) {
      loadRemoteMainWindow(getServerUrl())
    }
  })

  ipcMain.handle('reset-server-url', async () => {
    store.set(serverUrlKey, DEFAULT_SERVER)
    loadRemoteMainWindow(getServerUrl())
  })

  createWindow()
  initPopupWindow()

  // Check for updates (downloads and notifies user when ready)
  if (!is.dev && app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', function () {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
