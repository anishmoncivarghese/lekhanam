import { app, BrowserWindow, shell, protocol, net, nativeImage, Menu, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, rmSync } from 'fs'

// User-writable models directory (vosk models downloaded by the user)
// MAS builds use app container; DMG builds use ~/Documents/Lekhanam/
const USER_MODELS_DIR = process.mas
  ? join(app.getPath('userData'), 'models')
  : join(homedir(), 'Documents', 'Lekhanam', 'models')
import { registerIpcHandlers } from './ipc'
import { MODELS_DIR } from './SpeechService'

// Fix GPU process crash on macOS 26 (Darwin 25+) with Electron 36
// The GPU sandbox is too restrictive in macOS 26 and kills the GPU process (exit code 15)
app.commandLine.appendSwitch('disable-gpu-sandbox')

// Fix V8 brk-0 crash in Chromium proxy resolver on macOS 26 + MAS sandbox.
// Chromium spins up a separate V8 isolate on a worker thread to evaluate PAC
// (proxy auto-config) scripts. On macOS 26 under the MAS sandbox, that isolate
// cannot acquire MAP_JIT permission and the first V8 codegen brk-0's the whole
// app — visible as crashes deep in the DNS-blocking thread with V8 frames.
// We don't ship a PAC URL or rely on system proxy detection, so disabling the
// proxy server entirely is safe and removes the crashing code path.
app.commandLine.appendSwitch('no-proxy-server')


// Register custom scheme BEFORE app is ready.
// The renderer (and vosk-browser Web Workers) fetch model files via:
//   lekhanam://models/vosk-model-small-en-us-0.15.zip
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lekhanam',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const isDev = process.env.NODE_ENV !== 'production'

// Native macOS "About Lekhanam" menu item
app.setAboutPanelOptions({
  applicationName: 'Lekhanam',
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: `© ${new Date().getFullYear()} Lekhanam. All rights reserved.`,
  credits: 'Built for writers who think locally.\nAll your writing lives on your Mac. No cloud. No sync. No tracking.',
})

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#faf8f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: process.mas ? true : false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Catch renderer process crashes (e.g. native module crash, OOM)
  mainWindow.webContents.on('render-process-gone', async (_event, details) => {
    console.error('[Lekhanam] Renderer process gone:', details.reason)

    // Don't show dialog for a clean exit
    if (details.reason === 'clean-exit') return

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Lekhanam stopped unexpectedly',
      message: 'The app ran into a problem and stopped.',
      detail: `Your writing is safely saved.\n\nWould you like to restart?`,
      buttons: ['Restart', 'Send Report', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    })

    if (response === 0) {
      app.relaunch()
      app.exit(0)
    } else if (response === 1) {
      const version = app.getVersion()
      const subject = encodeURIComponent('[Lekhanam] App Crash Report')
      const body = encodeURIComponent(
        `Hi Lekhanam Support,\n\nI experienced a crash in the app.\n\nApp Version: ${version}\nPlatform: macOS\nDate/Time: ${new Date().toLocaleString()}\nCrash reason: ${details.reason}\n\n--- Additional Notes ---\n(Please describe what you were doing when the crash occurred)`
      )
      shell.openExternal(`mailto:support@lekhanam.app?subject=${subject}&body=${body}`)
    } else {
      app.exit(0)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Set dock icon in dev mode (production uses the app bundle icon automatically)
if (!app.isPackaged && process.platform === 'darwin') {
  const icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
  app.dock.setIcon(icon)
}

function buildAppMenu(): void {
  const dataDir = process.mas
    ? app.getPath('userData')
    : join(homedir(), 'Documents', 'Lekhanam')

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        // On MAS, uninstall is handled via Launchpad — hide this menu item
        ...(!process.mas ? [{
          label: 'Uninstall Lekhanam…',
          click: async () => {
            const { response, checkboxChecked } = await dialog.showMessageBox({
              type: 'warning',
              title: 'Uninstall Lekhanam',
              message: 'Move Lekhanam to Trash?',
              detail: 'Lekhanam will be moved to Trash. Your books stay in ~/Documents/Lekhanam/ unless you check the box below.',
              checkboxLabel: 'Also remove all books and app data from ~/Documents/Lekhanam/',
              checkboxChecked: false,
              buttons: ['Move to Trash', 'Cancel'],
              defaultId: 0,
              cancelId: 1,
            })
            if (response === 0) {
              if (checkboxChecked && existsSync(dataDir)) {
                rmSync(dataDir, { recursive: true, force: true })
              }
              if (app.isPackaged) {
                const exePath = app.getPath('exe')
                const appBundle = exePath.substring(0, exePath.indexOf('.app') + 4)
                app.quit()
                await shell.trashItem(appBundle)
              } else {
                app.quit()
              }
            }
          }
        } as Electron.MenuItemConstructorOptions, { type: 'separator' } as Electron.MenuItemConstructorOptions] : []),
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  // Serve files from the bundled models directory under lekhanam://
  // Dev:  {project}/resources/models/
  // Prod: {app}/Contents/Resources/models/
  protocol.handle('lekhanam', (request) => {
    const url = new URL(request.url)
    const relativePath = url.pathname.replace(/^\/+/, '')
    // Check user-downloaded models first, then fall back to bundled app models
    const userPath = join(USER_MODELS_DIR, relativePath)
    if (existsSync(userPath)) {
      return net.fetch(`file://${userPath}`)
    }
    const bundledPath = join(MODELS_DIR, relativePath)
    return net.fetch(`file://${bundledPath}`)
  })

  buildAppMenu()
  const mainWindow = createWindow()
  await registerIpcHandlers(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // MAS: quit when the main window is closed.
  // Lekhanam is a single-window app — Apple Guideline 4 requires either a
  // Window menu item to reopen the window, or quitting on close.
  // Quitting on close is the simpler, accepted fix for single-window apps.
  // DMG: preserve standard macOS behaviour (app stays in dock after window close).
  if (process.platform !== 'darwin' || process.mas) {
    app.quit()
  }
})
