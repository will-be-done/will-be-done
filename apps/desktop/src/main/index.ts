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

const serverUrlKey = 'serverUrl'

// electron-store v11 is ESM; electron-vite compiles main as CJS, so default export may be wrapped
const Store =
  (ElectronStore as unknown as { default: typeof ElectronStore }).default || ElectronStore
const store = new Store<{ serverUrl?: string }>()

const DEFAULT_SERVER = 'https://app.will-be-done.app'

let mainWindow: BrowserWindow | null = null
let popupWindow: BrowserWindow | null = null

function getServerUrl(): string {
  return (store.get(serverUrlKey) as string | undefined) || DEFAULT_SERVER
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // In dev, load the web app's Vite dev server; in prod, load the saved server URL
  if (is.dev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadURL(getServerUrl())
  }

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
      sandbox: false
    }
  })

  popupWindow.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
  popupWindow.setAlwaysOnTop(true, 'pop-up-menu')

  const popupUrl = is.dev ? 'http://localhost:5173/popup' : `${getServerUrl()}/popup`
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
  popupWindow.focus()
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
  electronApp.setAppUserModelId('app.will-be-done')

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

  // IPC: get/set server URL, reload window to new server
  ipcMain.handle('get-server-url', () => {
    return getServerUrl()
  })

  ipcMain.handle('set-server-url', (_event, url: string) => {
    store.set(serverUrlKey, url)
    if (!is.dev && mainWindow) {
      mainWindow.loadURL(url)
    }
  })

  createWindow()
  initPopupWindow()

  // Check for updates (downloads and notifies user when ready)
  autoUpdater.checkForUpdatesAndNotify()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
