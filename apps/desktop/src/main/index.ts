import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  globalShortcut,
  screen,
  nativeImage,
  Tray
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import ElectronStore from 'electron-store'
import * as dbusNative from '@homebridge/dbus-native'

app.setName('Will Be Done')

app.commandLine.appendSwitch(
  'enable-features',
  [
    'OverlayScrollbar',
    'OverlayScrollbarFlashAfterAnyScrollUpdate',
    'FluentOverlayScrollbar',
    'FluentScrollbar',
    // Electron's globalShortcut API needs the desktop portal under Wayland.
    'GlobalShortcutsPortal',
    // Pass the requested accelerator to portals that support preferred triggers.
    'GlobalShortcutsPortalPreferredTrigger'
  ].join(',')
)

if (is.dev) {
  app.setName('Will Be Done Dev')
}

if (is.dev) {
  // Let's make separate app data folder for development
  // It will allow to run both production and development versions of the app
  // at the same time + fix potential syncing issue(cause dev version points to dev server)
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

const SHOW_QUICK_ADD_ARG = '--show-quick-add'
const FLATPAK_APP_ID = 'app.willbedone.WillBeDone'
const DBUS_OBJECT_PATH = '/app/willbedone/WillBeDone'
const gotTheLock = app.requestSingleInstanceLock()

interface AppControlBus {
  connection: {
    end(): void
    on(event: 'error', listener: (error: Error) => void): void
  }
  exportInterface(
    implementation: { ShowMainWindow(): void; ShowQuickAdd(): void },
    path: string,
    descriptor: {
      name: string
      methods: {
        ShowMainWindow: [string, string]
        ShowQuickAdd: [string, string]
      }
    }
  ): void
  requestName(
    name: string,
    flags: number,
    callback: (error: Error | undefined, result: number) => void
  ): void
}

function hasQuickAddArgument(commandLine: string[]): boolean {
  return commandLine.includes(SHOW_QUICK_ADD_ARG) || app.commandLine.hasSwitch('show-quick-add')
}

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (hasQuickAddArgument(commandLine)) {
      logPopup('quick add requested by second instance')
      showPopup()
      return
    }

    // Someone tried to run a second instance, so focus the main window.
    showMainWindow()
  })

  // Note: Windows only
  if (process.platform === 'win32') {
    app.setAppUserModelId(app.name)
  }
}

const serverUrlKey = 'serverUrl'

// electron-store v11 is ESM; electron-vite compiles main as CJS, so default export may be wrapped
const Store =
  (ElectronStore as unknown as { default: typeof ElectronStore }).default || ElectronStore
const store = new Store<{ serverUrl?: string }>()

const DEFAULT_SERVER = is.dev ? 'http://localhost:5173' : 'http://localhost:3000'
const SERVER_CHECK_TIMEOUT_MS = 5000
const SERVER_CHECK_FILE = '631521eb-a436-4740-9db3-e6f1d72392fe.json'
const SERVER_CHECK_NONCE = '4f2c9a71-f7bb-4a57-b9b9-6d433c9f5b2e'

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null
let tray: Tray | null = null
let loadingLocalMainWindow = false
let isQuitting = false
let appControlBus: AppControlBus | null = null
let popupFocusRequestId = 0

function registerQuickAddBus(): void {
  if (process.env.FLATPAK_ID !== FLATPAK_APP_ID) return

  try {
    const bus = (
      dbusNative as unknown as {
        sessionBus(): AppControlBus
      }
    ).sessionBus()

    bus.connection.on('error', (error) => {
      console.error('Quick Add D-Bus connection failed:', error)
    })

    bus.requestName(FLATPAK_APP_ID, 0, (error, result) => {
      if (error || (result !== 1 && result !== 4)) {
        console.error('Failed to own Quick Add D-Bus name:', error || `result ${result}`)
        bus.connection.end()
        return
      }

      bus.exportInterface(
        {
          ShowMainWindow(): void {
            showMainWindow()
          },
          ShowQuickAdd(): void {
            showPopup()
          }
        },
        DBUS_OBJECT_PATH,
        {
          name: FLATPAK_APP_ID,
          methods: {
            ShowMainWindow: ['', ''],
            ShowQuickAdd: ['', '']
          }
        }
      )
      appControlBus = bus
      logPopup('application D-Bus interface registered')
    })
  } catch (error) {
    console.error('Failed to register Quick Add D-Bus interface:', error)
  }
}

function getServerUrl(): string {
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
  return new URL(`/${SERVER_CHECK_FILE}`, `${serverUrl}/`).toString()
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
          ? `Could not verify ${normalizedUrl}. The server did not respond with the expected Will Be Done check file.`
          : `Failed to load ${checkUrl}. Server responded with status ${response.status}.`

      return {
        ok: false,
        serverUrl: normalizedUrl,
        status: response.status,
        error
      }
    }

    let checkPayload: { nonce?: unknown }
    try {
      checkPayload = (await response.json()) as { nonce?: unknown }
    } catch {
      return {
        ok: false,
        serverUrl: normalizedUrl,
        error: `Could not verify ${normalizedUrl}. The server check file did not return valid JSON.`
      }
    }

    if (checkPayload.nonce !== SERVER_CHECK_NONCE) {
      return {
        ok: false,
        serverUrl: normalizedUrl,
        error: `Could not verify ${normalizedUrl}. The server check file did not contain the expected nonce.`
      }
    }

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

  loadingLocalMainWindow = true

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (is.dev && rendererUrl) {
    const localUrl = new URL(rendererUrl)
    query.forEach((value, key) => localUrl.searchParams.set(key, value))
    void mainWindow.loadURL(localUrl.toString()).catch(() => undefined)
    return
  }

  void mainWindow
    .loadFile(join(__dirname, '../renderer/index.html'), {
      query: Object.fromEntries(query.entries())
    })
    .catch(() => undefined)
}

function loadRemoteMainWindow(url: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  void mainWindow.loadURL(url).catch(() => undefined)
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(showOnReady = true): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 400,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    backgroundColor: '#100c09',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (showOnReady) {
      mainWindow?.show()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    loadingLocalMainWindow = false
  })

  mainWindow.webContents.on('did-finish-load', () => {
    loadingLocalMainWindow = false
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
      if (loadingLocalMainWindow) return

      loadLocalMainWindow('recovery', validatedURL)
    }
  )

  loadRemoteMainWindow(getServerUrl())

  buildMenu()
}

function initTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(process.platform === 'darwin' ? trayIcon : trayIcon.resize({ width: 20 }))
  tray.setToolTip(app.name)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Will Be Done',
        click: showMainWindow
      },
      {
        label: 'Quick Add',
        click: showPopup
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => app.quit()
      }
    ])
  )
  tray.on('click', showMainWindow)
}

const POPUP_WIDTH = 500
const POPUP_HEIGHT = 160
const POPUP_LOG_PREFIX = '[quick-add]'

function logPopup(message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(POPUP_LOG_PREFIX, message)
  } else {
    console.log(POPUP_LOG_PREFIX, message, details)
  }
}

function initPopupWindow(): void {
  logPopup('creating popup window')
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
  logPopup('loading popup URL', popupUrl)
  void popupWindow.loadURL(popupUrl).catch((error: unknown) => {
    console.error(POPUP_LOG_PREFIX, 'failed to load popup URL', error)
  })
  const thisWindow = popupWindow

  popupWindow.once('ready-to-show', () => {
    logPopup('popup is ready to show')
  })

  popupWindow.webContents.on('did-finish-load', () => {
    logPopup('popup content finished loading')
  })

  popupWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) {
        console.error(POPUP_LOG_PREFIX, 'popup content failed to load', {
          errorCode,
          errorDescription,
          validatedURL
        })
      }
    }
  )

  if (process.platform !== 'linux') {
    popupWindow.on('blur', () => {
      logPopup('popup lost focus; hiding it')
      hidePopup()
    })
  }

  // If the window is somehow destroyed, recreate it
  popupWindow.on('closed', () => {
    if (popupWindow === thisWindow) {
      popupWindow = null
    }
  })
}

function showPopup(): void {
  logPopup('show requested')
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
  if (!popupWindow || popupWindow.isDestroyed()) {
    logPopup('cannot show because the popup window does not exist')
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const activeDisplay = screen.getDisplayNearestPoint(cursorPoint)
  const { x: dx, y: dy, width: dw, height: dh } = activeDisplay.workArea

  popupWindow.setPosition(Math.round(dx + dw / 2 - POPUP_WIDTH / 2), Math.round(dy + dh / 3))

  popupWindow.show()
  popupWindow.focus()
  popupWindow.webContents.focus()
  popupWindow.webContents.send('popup-show')
  retryPopupInputFocus(popupWindow, ++popupFocusRequestId)

  logPopup('popup shown', {
    position: popupWindow.getPosition(),
    visible: popupWindow.isVisible(),
    focused: popupWindow.isFocused()
  })
}

function retryPopupInputFocus(window: BrowserWindow, requestId: number, attemptsLeft = 20): void {
  setTimeout(() => {
    if (
      requestId !== popupFocusRequestId ||
      attemptsLeft === 0 ||
      window.isDestroyed() ||
      !window.isVisible()
    ) {
      return
    }

    void window.webContents
      .executeJavaScript(
        "(() => { const input = document.querySelector('input'); input?.focus(); return document.activeElement === input })()"
      )
      .then((focused) => {
        if (focused) {
          logPopup('input focused by retry', { attempts: 21 - attemptsLeft })
          return
        }

        retryPopupInputFocus(window, requestId, attemptsLeft - 1)
      })
      .catch((error: unknown) => {
        console.error(POPUP_LOG_PREFIX, 'input focus retry failed', error)
      })
  }, 50)
}

function hidePopup(): void {
  popupFocusRequestId += 1
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide()
  }
}

function reloadPopupWindow(): void {
  const wasVisible = !!popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()

  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.destroy()
  }

  initPopupWindow()

  if (wasVisible && popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.once('ready-to-show', () => {
      positionAndShowPopup()
    })
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
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CommandOrControl+Alt+I',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.toggleDevTools()
          }
        },
        { type: 'separator' },
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

  const menu = process.platform === 'darwin' ? Menu.buildFromTemplate(template) : null
  Menu.setApplicationMenu(menu)
}

if (gotTheLock) {
  app.whenReady().then(() => {
    logPopup('Electron ready', {
      platform: process.platform,
      sessionType: process.env.XDG_SESSION_TYPE || 'unknown',
      waylandDisplay: Boolean(process.env.WAYLAND_DISPLAY),
      ozonePlatform: app.commandLine.getSwitchValue('ozone-platform') || 'default'
    })

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
    const quickAddShortcuts = ['CmdOrCtrl+Shift+A']

    for (const quickAddShortcut of quickAddShortcuts) {
      logPopup('registering global shortcut', quickAddShortcut)
      const shortcutRegistered = globalShortcut.register(quickAddShortcut, () => {
        logPopup('global shortcut activated', quickAddShortcut)
        showPopup()
      })
      const shortcutIsRegistered = globalShortcut.isRegistered(quickAddShortcut)
      if (!shortcutRegistered || !shortcutIsRegistered) {
        console.error(`Failed to register global shortcut: ${quickAddShortcut}`)
      } else {
        logPopup('global shortcut registered', quickAddShortcut)
      }
    }

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

      reloadPopupWindow()

      // Destroy and recreate the main window to cleanly navigate to the new server
      // (avoids race conditions between the renderer's JS and loadURL)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
      createWindow()
    })

    ipcMain.handle('reset-server-url', async () => {
      store.set(serverUrlKey, DEFAULT_SERVER)

      reloadPopupWindow()

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy()
      }
      createWindow()
    })

    const showQuickAddAtLaunch = hasQuickAddArgument(process.argv)
    createWindow(!showQuickAddAtLaunch)
    initPopupWindow()
    initTray()
    registerQuickAddBus()

    if (showQuickAddAtLaunch) {
      logPopup('quick add requested at launch')
      popupWindow?.once('ready-to-show', () => {
        showPopup()
      })
    }

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
}

app.on('before-quit', () => {
  isQuitting = true
  appControlBus?.connection.end()
  appControlBus = null
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
