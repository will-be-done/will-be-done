import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  globalShortcut,
  screen,
  nativeImage,
  Tray,
  type IpcMainInvokeEvent
} from 'electron'
import { Data, Effect, Fiber, Schema } from 'effect'
import { listenForGoogleAuth, stopGoogleAuth, validateGoogleAuthLaunch } from './googleAuth'
import { checkServerUrl, isHttpUrl } from './serverCheck'
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

const DEFAULT_SERVER = is.dev ? 'http://localhost:5173' : 'https://app.will-be-done.app'

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null
let tray: Tray | null = null
let loadingLocalMainWindow = false
let isQuitting = false
let appControlBus: AppControlBus | null = null
let popupFocus: Fiber.Fiber<void> | null = null

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

// The main window runs code served by the configured server, so its IPC input
// is untrusted: only its main frame may call these, with arguments decoded.
function handleFromMainWindow<Args extends ReadonlyArray<unknown>>(
  channel: string,
  args: Schema.Decoder<Args>,
  handler: (event: IpcMainInvokeEvent, args: NoInfer<Args>) => unknown
): void {
  const decodeArgs = Schema.decodeUnknownSync(args)
  ipcMain.handle(channel, (event, ...input: unknown[]) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      throw new Error(`${channel} must be called from the main app window`)
    }
    return handler(event, decodeArgs(input))
  })
}

function getServerUrl(): string {
  return (store.get(serverUrlKey) as string | undefined) || DEFAULT_SERVER
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
  focusPopupInput(popupWindow)

  logPopup('popup shown', {
    position: popupWindow.getPosition(),
    visible: popupWindow.isVisible(),
    focused: popupWindow.isFocused()
  })
}

class InputNotFocused extends Data.TaggedError('InputNotFocused') {}

class FocusScriptFailed extends Data.TaggedError('FocusScriptFailed')<{
  readonly cause: unknown
}> {}

const FOCUS_POPUP_INPUT =
  "(() => { const input = document.querySelector('input'); input?.focus(); return document.activeElement === input })()"

function stopPopupFocus(): void {
  if (popupFocus) Effect.runFork(Fiber.interrupt(popupFocus))
  popupFocus = null
}

function focusPopupInput(window: BrowserWindow): void {
  stopPopupFocus()
  let attempts = 0
  const attempt = Effect.gen(function* () {
    yield* Effect.sleep(50)
    if (window.isDestroyed() || !window.isVisible()) return
    attempts += 1
    const focused = yield* Effect.tryPromise({
      try: () => window.webContents.executeJavaScript(FOCUS_POPUP_INPUT) as Promise<boolean>,
      catch: (cause) => new FocusScriptFailed({ cause })
    })
    if (!focused) return yield* new InputNotFocused()
    logPopup('input focused by retry', { attempts })
  })
  popupFocus = Effect.runFork(
    attempt.pipe(
      Effect.retry({ times: 19, while: (error) => error._tag === 'InputNotFocused' }),
      Effect.catchTags({
        InputNotFocused: () => Effect.void,
        FocusScriptFailed: ({ cause }) =>
          Effect.sync(() => console.error(POPUP_LOG_PREFIX, 'input focus retry failed', cause))
      })
    )
  )
}

function hidePopup(): void {
  stopPopupFocus()
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

type EditHistoryCommand = 'undo' | 'redo'

// The page undoes app changes outside text fields and answers
// 'native-edit-history' for everything else, including pages that predate it.
function sendEditHistory(command: EditHistoryCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('edit-history', command)
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
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => sendEditHistory('undo')
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => sendEditHistory('redo')
        },
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

    ipcMain.on('native-edit-history', (event, command: unknown) => {
      if (command === 'undo') event.sender.undo()
      else if (command === 'redo') event.sender.redo()
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

    handleFromMainWindow('run-google-auth', Schema.Tuple([Schema.String]), async (event, [url]) => {
      const launchUrl = new URL(
        validateGoogleAuthLaunch(getServerUrl(), event.senderFrame!.url, url)
      )
      const { port, completion, stop } = await listenForGoogleAuth(
        launchUrl.searchParams.get('id')!,
        showMainWindow
      )
      launchUrl.searchParams.set('port', String(port))
      try {
        await shell.openExternal(launchUrl.href)
      } catch (error) {
        stop()
        throw error
      }
      return completion
    })

    handleFromMainWindow('cancel-google-auth', Schema.Tuple([Schema.String]), (_event, [flowId]) =>
      stopGoogleAuth(flowId)
    )

    // IPC: get/set server URL, reload window to new server
    handleFromMainWindow('get-server-url', Schema.Tuple([]), () => getServerUrl())

    handleFromMainWindow(
      'check-server-url',
      Schema.Tuple([Schema.UndefinedOr(Schema.String)]),
      (_event, [url]) => checkServerUrl(url || getServerUrl())
    )

    handleFromMainWindow('set-server-url', Schema.Tuple([Schema.String]), async (_event, [url]) => {
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

    handleFromMainWindow('reset-server-url', Schema.Tuple([]), () => {
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
      autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
        console.error('Update check failed:', error)
      })
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
