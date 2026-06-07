import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell,
} from 'electron'
import fs from 'fs'

// 抑制 GPU 初始化失败报错（常见于 Linux/VM/远程桌面）
// 若本机 GPU 正常且无报错，可注释掉以下两行
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')
// Linux Wayland：启用 Portal 以支持全局快捷键（否则 globalShortcut 可能无效）
if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
}
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UiohookKey } from 'uiohook-napi'
import { ASRProvider } from './asr-provider'
import { configManager } from './config-manager'
import { DASHSCOPE, FLASH_NOTE, GLM_ASR, qwenShortAsrModelName } from '../shared/constants'
import {
  fileUrlFromErpnextUploadResponse,
  uploadErpnextcnDtyFile,
  uploadErpnextcnDtyMp3,
} from './erpnextcn-upload'
import { generateTextWithTextLlm, probeTextLlmConnection } from './dashscope-text-generation'
import { runMainProcessDiagnostics } from './diagnostics'
import { testQwenDashScopeConnection, transcribeQwenFromFileUrl } from './qwen-asr-provider'
import { historyManager } from './history-manager'
import { hotkeyManager } from './hotkey-manager'
import { initMainI18n, setMainLanguage, t } from './i18n'
import { ioHookManager } from './iohook-manager'
import { textInjector } from './text-injector'
import { resolveTextForInjection } from './voice-command-runner'
import { runCraftsmanChat } from './craftsman-chat'
import { UpdaterManager } from './updater-manager'
import { startHttpServer, stopHttpServer } from './http-server'
import {
  ASRConfig,
  CraftsmanChatPayload,
  CraftsmanChatResult,
  DiagnosticsRunResult,
  FlashChunkStatus,
  FlashGenerateSummaryPayload,
  FlashGenerateSummaryResult,
  IPC_CHANNELS,
  OverlayState,
  RecorderLockOwner,
  TextLlmConfig,
  VoiceSession,
} from '../shared/types'
import { FlashNoteRepository } from './flash-note-repository'
// ES Module compatibility - 延迟导入 fluent-ffmpeg 避免启动时的 __dirname 错误
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpeg: any
let ffmpegInitialized = false

function initializeFfmpeg() {
  if (ffmpegInitialized) return

  try {
    const require = createRequire(import.meta.url)
    const ffmpegModule = require('fluent-ffmpeg')
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')

    let ffmpegPath = ffmpegInstaller.path

    // 生产环境中，FFmpeg 二进制被解压到 app.asar.unpacked 目录
    if (app.isPackaged) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
    }

    ffmpeg = ffmpegModule
    ffmpeg.setFfmpegPath(ffmpegPath)
    ffmpegInitialized = true
    console.log('[Main] FFmpeg initialized with path:', ffmpegPath)
  } catch (error) {
    console.error('[Main] Failed to initialize FFmpeg:', error)
    // 显示错误状态并在2秒后隐藏 HUD
    updateOverlay({ status: 'error', message: t('errors.ffmpegInitFailed') })
    setTimeout(() => hideOverlay(), 2000)
    throw error // 重新抛出以便调用方知道初始化失败
  }
}

// const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 目录结构
process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// 全局变量
// 更清晰的命名
let backgroundWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let tray: Tray | null = null
// const audioRecorder = new AudioRecorder()
let asrProvider: ASRProvider | null = null
let currentSession: VoiceSession | null = null
let recorderLockOwner: RecorderLockOwner = 'none'

type CaptureContext =
  | {
      owner: 'ptt'
      sessionId: string
      startedAt: number
      durationMs?: number
    }
  | {
      owner: 'flash'
      sessionId: string
      chunkId: string
      chunkIndex: number
      startedAt: number
      endedAt?: number
    }

interface FlashRuntimeState {
  sessionId: string | null
  startedAt: number
  isEnding: boolean
  chunkIndex: number
  chunkTimer: NodeJS.Timeout | null
  elapsedTimer: NodeJS.Timeout | null
}

const flashRuntime: FlashRuntimeState = {
  sessionId: null,
  startedAt: 0,
  isEnding: false,
  chunkIndex: 0,
  chunkTimer: null,
  elapsedTimer: null,
}

let activeCaptureContext: CaptureContext | null = null
let stoppedCaptureContext: CaptureContext | null = null

const flashDbPath = path.join(app.getPath('userData'), 'flash-note', 'flash-note.sqlite')
const flashRepository = new FlashNoteRepository(flashDbPath)

// 创建主窗口（隐藏的后台窗口）
function createMainWindow() {
  backgroundWindow = new BrowserWindow({
    show: false, // MVP版本不显示主窗口
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // 隐藏窗口默认会 background 节流，易导致 MediaRecorder 几乎不产出数据（仅几十字节 webm）
      backgroundThrottling: false,
    },
  })

  // backgroundWindow 只渲染 AudioRecorder，不需要 DevTools
  // 如需调试录音逻辑，可在 settingsWindow 的 DevTools Console 中查看日志
  // 打开开发者工具以查看 renderer 进程日志（开发模式）
  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.webContents.openDevTools({ mode: 'detach' })
  }

  if (VITE_DEV_SERVER_URL) {
    backgroundWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    backgroundWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // 监听页面加载完成
  backgroundWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] backgroundWindow finished loading')
    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      backgroundWindow.webContents.setBackgroundThrottling(false)
    }
  })

  // 监听页面加载失败
  backgroundWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Main] backgroundWindow failed to load:', errorCode, errorDescription)
  })

  scheduleRecoverFlashSessionWhenBackgroundReady()
}

// 创建设置窗口
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus()
    return
  }
  // 4:3 比例，适合管理界面
  const isMac = process.platform === 'darwin'
  settingsWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 560,
    minHeight: 420,
    title: t('window.settingsTitle'),
    // 统一使用隐藏标题栏，在所有平台上自定义标题栏
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden', // macOS 保留交通灯，Windows/Linux 完全隐藏
    trafficLightPosition: { x: 20, y: 10 }, // 与自定义标题栏 h-8（32px）垂直居中
    vibrancy: 'sidebar', // macOS 毛玻璃效果（可选）
    transparent: true, // 透明窗口，用于四角圆角
    backgroundColor: '#00000000', // 透明背景
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    settingsWindow.loadURL(`${VITE_DEV_SERVER_URL}#/settings`)
    // 开发模式下打开 DevTools
    settingsWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    settingsWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      hash: '/settings',
    })
  }

  settingsWindow.on('closed', () => {
    UpdaterManager.setSettingsWindow(null)
    settingsWindow = null
  })

  // 通知 UpdaterManager 设置窗口已创建
  UpdaterManager.setSettingsWindow(settingsWindow)
}

// 创建录音状态浮窗 (透明、无边框、置顶)
function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const overlayWidth = 200
  const overlayHeight = 60
  const bottomMargin = 60

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: Math.round((screenWidth - overlayWidth) / 2),
    y: screenHeight - overlayHeight - bottomMargin,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${VITE_DEV_SERVER_URL}#/overlay`)
  } else {
    overlayWindow.loadFile(path.join(RENDERER_DIST, 'index.html'), {
      hash: '/overlay',
    })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

/** 在后台页就绪后再恢复闪记，避免 SESSION_START 早于 AudioRecorder 挂载而丢失 */
function scheduleRecoverFlashSessionWhenBackgroundReady(): void {
  if (!backgroundWindow || backgroundWindow.isDestroyed()) return
  const wc = backgroundWindow.webContents
  const run = () => {
    recoverFlashSessionIfNeeded()
  }
  if (wc.isLoading()) {
    wc.once('did-finish-load', run)
  } else {
    queueMicrotask(run)
  }
}

/** 录音 HUD 需可点击；若全程 setIgnoreMouseEvents(true)，事件穿透则永远收不到 mouseenter，结束按钮无效 */
function setOverlayMouseInteractionForState(state: OverlayState): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (state.status === 'recording') {
    overlayWindow.setIgnoreMouseEvents(false)
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }
}

// 显示/隐藏/更新浮窗状态
function showOverlay(state: OverlayState) {
  console.log(`[Main] 🔵 showOverlay:`, JSON.stringify(state))
  console.log(`[Main] 🔵 showOverlay called from:`, new Error().stack?.split('\n')[2])
  const win = createOverlayWindow()
  win.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
  win.showInactive()
  setOverlayMouseInteractionForState(state)
}

function hideOverlay() {
  console.log(`[Main] 🔵 hideOverlay`)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.hide()
  }
}

// 统一错误处理：显示错误状态并自动关闭 HUD
function showErrorAndHide(message: string, hideDelay = 2000) {
  console.log(`[Main] 🔴 showErrorAndHide: ${message}`)
  updateOverlay({ status: 'error', message })
  setTimeout(() => hideOverlay(), hideDelay)
}

function updateOverlay(state: OverlayState) {
  console.log(`[Main] 🔵 updateOverlay:`, JSON.stringify(state))
  if (state.status === 'error') {
    console.log(`[Main] 🔴 ERROR state sent! Stack:`, new Error().stack)
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_UPDATE, state)
    setOverlayMouseInteractionForState(state)
  }
}

function clearFlashTimers(): void {
  if (flashRuntime.chunkTimer) {
    clearTimeout(flashRuntime.chunkTimer)
    flashRuntime.chunkTimer = null
  }
  if (flashRuntime.elapsedTimer) {
    clearInterval(flashRuntime.elapsedTimer)
    flashRuntime.elapsedTimer = null
  }
}

function isFlashActive(): boolean {
  return !!flashRuntime.sessionId
}

/** 与托盘「放弃闪记」enabled 同步；避免每个分片 DB 更新都重建菜单 */
let lastTrayFlashActive: boolean | null = null

function notifyFlashStateChanged(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(IPC_CHANNELS.FLASH_STATE_CHANGED)
  }
  const active = isFlashActive()
  if (active !== lastTrayFlashActive) {
    lastTrayFlashActive = active
    refreshLocalizedUi()
  }
}

function startFlashOverlayTicker(sessionId: string): void {
  if (!flashRuntime.startedAt) return
  if (flashRuntime.elapsedTimer) clearInterval(flashRuntime.elapsedTimer)
  flashRuntime.elapsedTimer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - flashRuntime.startedAt) / 1000)
    updateOverlay({
      status: 'recording',
      mode: 'flash',
      sessionId,
      elapsedSeconds,
    })
  }, 1000)
}

function updateFlashChunkStatus(
  chunkId: string,
  status: FlashChunkStatus,
  errorMessage?: string,
): void {
  flashRepository.updateChunk({
    chunkId,
    status,
    errorMessage: errorMessage ?? null,
  })
  notifyFlashStateChanged()
}

/** 上一段 stop 与下一段 start 的间隔（ms），避免连得太紧导致渲染进程 WebM 无声音 */
const FLASH_NEXT_CHUNK_DELAY_MS = 280

function beginFlashChunkCapture(sessionId: string): void {
  if (!flashRuntime.sessionId || flashRuntime.sessionId !== sessionId || flashRuntime.isEnding) {
    return
  }
  if (!backgroundWindow || backgroundWindow.isDestroyed()) {
    throw new Error('background window unavailable')
  }
  if (activeCaptureContext || recorderLockOwner === 'ptt') {
    return
  }
  const chunkId = `flash-chunk-${Date.now()}`
  const chunkIndex = flashRuntime.chunkIndex + 1
  flashRuntime.chunkIndex = chunkIndex
  activeCaptureContext = {
    owner: 'flash',
    sessionId,
    chunkId,
    chunkIndex,
    startedAt: Date.now(),
  }
  recorderLockOwner = 'flash'

  showOverlay({
    status: 'recording',
    mode: 'flash',
    sessionId,
    elapsedSeconds: Math.floor((Date.now() - flashRuntime.startedAt) / 1000),
  })
  startFlashOverlayTicker(sessionId)

  backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_START, {
    captureMode: 'flash',
  })
  flashRuntime.chunkTimer = setTimeout(() => {
    void stopActiveFlashChunk(false)
  }, FLASH_NOTE.CHUNK_DURATION_SEC * 1000)
}

async function startFlashSession(startedAt?: number): Promise<{ sessionId: string }> {
  if (isFlashActive()) {
    return { sessionId: flashRuntime.sessionId as string }
  }
  if (recorderLockOwner === 'ptt') {
    throw new Error('PTT 正在录音，请稍后再试')
  }
  const t0 = startedAt ?? Date.now()
  const sessionId = `flash-${t0}`
  flashRuntime.sessionId = sessionId
  flashRuntime.startedAt = t0
  flashRuntime.isEnding = false
  flashRuntime.chunkIndex = 0
  flashRepository.createSession(sessionId, new Date(t0).toISOString(), 'recording')
  notifyFlashStateChanged()
  beginFlashChunkCapture(sessionId)
  return { sessionId }
}

async function stopActiveFlashChunk(endSession: boolean): Promise<void> {
  const active = activeCaptureContext
  if (!active || active.owner !== 'flash') {
    if (endSession && flashRuntime.sessionId) {
      await finalizeFlashSessionIfDone()
    }
    return
  }

  if (!backgroundWindow || backgroundWindow.isDestroyed()) {
    throw new Error('background window unavailable')
  }

  clearFlashTimers()
  flashRuntime.isEnding = endSession
  const endedAt = Date.now()
  const chunkRow = {
    chunkId: active.chunkId,
    sessionId: active.sessionId,
    chunkIndex: active.chunkIndex,
    startedAt: new Date(active.startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    audioPath: null as string | null,
    remoteUrl: null as string | null,
    status: 'pending' as FlashChunkStatus,
  }
  flashRepository.createChunk(chunkRow)
  notifyFlashStateChanged()

  stoppedCaptureContext = { ...active, endedAt }
  activeCaptureContext = null
  recorderLockOwner = 'none'
  backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
}

async function finalizeFlashSessionIfDone(): Promise<void> {
  const sessionId = flashRuntime.sessionId
  if (!sessionId) return
  if (!flashRuntime.isEnding) return
  if (activeCaptureContext?.owner === 'flash') return

  const activeSession = flashRepository.getActiveSession()
  if (!activeSession || activeSession.sessionId !== sessionId) return
  const hasPending = activeSession.chunks.some((c) =>
    ['recording', 'pending', 'uploading', 'transcribing'].includes(c.status),
  )
  if (hasPending) return

  flashRepository.updateSessionStatus(sessionId, 'completed', new Date().toISOString())
  flashRuntime.sessionId = null
  flashRuntime.startedAt = 0
  flashRuntime.isEnding = false
  flashRuntime.chunkIndex = 0
  clearFlashTimers()
  if (recorderLockOwner === 'flash') recorderLockOwner = 'none'
  updateOverlay({ status: 'success', mode: 'flash', message: '闪记已完成' })
  setTimeout(() => hideOverlay(), 1000)
  notifyFlashStateChanged()
}

async function endFlashSession(): Promise<void> {
  if (!flashRuntime.sessionId) return
  flashRuntime.isEnding = true
  flashRepository.updateSessionStatus(flashRuntime.sessionId, 'flushing')
  notifyFlashStateChanged()
  await stopActiveFlashChunk(true)
  if (!activeCaptureContext) {
    await finalizeFlashSessionIfDone()
  }
}

// 设置开机自启
function updateAutoLaunchState(enable: boolean) {
  console.log(`[Main] Updating auto-launch state: ${enable}`)
  // Windows/macOS 通用 API
  // openAsHidden: true 让应用启动时隐藏主窗口（只显示托盘）
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
  })
}

// 创建托盘图标
function abandonStuckFlashSession(): void {
  const sid = flashRuntime.sessionId
  if (!sid) return
  console.log('[Main] abandonStuckFlashSession:', sid)
  clearFlashTimers()
  try {
    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
    }
  } catch {
    /* ignore */
  }
  flashRepository.updateSessionStatus(sid, 'failed', new Date().toISOString())
  activeCaptureContext = null
  stoppedCaptureContext = null
  flashRuntime.sessionId = null
  flashRuntime.startedAt = 0
  flashRuntime.isEnding = false
  flashRuntime.chunkIndex = 0
  if (recorderLockOwner === 'flash') recorderLockOwner = 'none'
  hideOverlay()
  notifyFlashStateChanged()
}

const buildTrayMenu = () =>
  Menu.buildFromTemplate([
    {
      label: t('tray.settings'),
      click: () => createSettingsWindow(),
    },
    {
      label: t('tray.abandonFlash'),
      enabled: isFlashActive(),
      click: () => abandonStuckFlashSession(),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        app.quit()
      },
    },
  ])

const refreshLocalizedUi = () => {
  if (tray) {
    tray.setToolTip(t('tray.tooltip'))
    tray.setContextMenu(buildTrayMenu())
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.setTitle(t('window.settingsTitle'))
  }
}

function createTray() {
  // 创建一个简单的托盘图标（后续可以替换为实际图标）
  const icon = nativeImage.createFromPath(path.join(process.env.VITE_PUBLIC, 'tray-icon.png'))
  // macOS 会自动查找 tray-icon@2x.png 用于 Retina 屏幕
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  refreshLocalizedUi()

  // 双击托盘图标打开设置
  tray.on('double-click', () => {
    createSettingsWindow()
  })
}

// 初始化 GLM ASR Provider（选用千问时不实例化，避免无谓失败）
function initializeASRProvider() {
  const config = configManager.getASRConfig()
  if (config.provider !== 'glm') {
    asrProvider = null
    return
  }
  asrProvider = new ASRProvider(config)
}

/**
 * 将 Electron Accelerator 格式字符串解析为 uiohook 参数
 *
 * 支持的格式：
 * - 单修饰键：Command, Control, Alt, Shift
 * - 组合键：Command+Space, Control+Shift+A
 * - 功能键：F1-F24
 * - 字母/数字：A-Z, 0-9
 *
 * @param accelerator Electron Accelerator 格式字符串
 * @returns { modifiers: string[], key: number } 或 null
 */
function parseAccelerator(accelerator: string): { modifiers: string[]; key: number } | null {
  const parts = accelerator.split('+')
  const keyStr = parts.pop()
  if (!keyStr) return null

  const lowerKey = keyStr.toLowerCase()

  // 1. 单独修饰键作为主键的情况（无其他修饰键）
  if (parts.length === 0) {
    if (lowerKey === 'command' || lowerKey === 'cmd' || lowerKey === 'meta') {
      return { modifiers: [], key: UiohookKey.Meta }
    }
    if (lowerKey === 'commandright') {
      return { modifiers: [], key: UiohookKey.MetaRight }
    }
    if (lowerKey === 'control' || lowerKey === 'ctrl') {
      return { modifiers: [], key: UiohookKey.Ctrl }
    }
    if (lowerKey === 'controlright') {
      return { modifiers: [], key: UiohookKey.CtrlRight }
    }
    if (lowerKey === 'alt' || lowerKey === 'option') {
      return { modifiers: [], key: UiohookKey.Alt }
    }
    if (lowerKey === 'altright') {
      return { modifiers: [], key: UiohookKey.AltRight }
    }
    if (lowerKey === 'shift') {
      return { modifiers: [], key: UiohookKey.Shift }
    }
    if (lowerKey === 'shiftright') {
      return { modifiers: [], key: UiohookKey.ShiftRight }
    }
  }

  // 2. 解析修饰键数组
  const modifiers = parts.map((p) => {
    const lower = p.toLowerCase()
    if (lower === 'command' || lower === 'cmd' || lower === 'meta') return 'meta'
    if (lower === 'control' || lower === 'ctrl') return 'ctrl'
    if (lower === 'alt' || lower === 'option') return 'alt'
    return lower
  })

  // 3. 解析主键
  const key = keyToUiohookCode(keyStr)
  if (key === null) {
    console.warn(`[Main] parseAccelerator: Unknown key "${keyStr}", falling back to Space`)
    return { modifiers, key: UiohookKey.Space }
  }

  return { modifiers, key }
}

/**
 * 将按键名称转换为 uiohook keycode
 */
function keyToUiohookCode(keyStr: string): number | null {
  const upper = keyStr.toUpperCase()
  const lower = keyStr.toLowerCase()

  // 特殊键映射
  const specialKeys: Record<string, number> = {
    SPACE: UiohookKey.Space,
    ENTER: UiohookKey.Enter,
    RETURN: UiohookKey.Enter,
    TAB: UiohookKey.Tab,
    BACKSPACE: UiohookKey.Backspace,
    DELETE: UiohookKey.Delete,
    ESCAPE: UiohookKey.Escape,
    ESC: UiohookKey.Escape,
    UP: UiohookKey.ArrowUp,
    DOWN: UiohookKey.ArrowDown,
    LEFT: UiohookKey.ArrowLeft,
    RIGHT: UiohookKey.ArrowRight,
    HOME: UiohookKey.Home,
    END: UiohookKey.End,
    PAGEUP: UiohookKey.PageUp,
    PAGEDOWN: UiohookKey.PageDown,
    INSERT: UiohookKey.Insert,
    CAPSLOCK: UiohookKey.CapsLock,
    NUMLOCK: UiohookKey.NumLock,
    PRINTSCREEN: UiohookKey.PrintScreen,
    // 标点符号
    COMMA: UiohookKey.Comma,
    PERIOD: UiohookKey.Period,
    SLASH: UiohookKey.Slash,
    BACKSLASH: UiohookKey.Backslash,
    SEMICOLON: UiohookKey.Semicolon,
    QUOTE: UiohookKey.Quote,
    BRACKETLEFT: UiohookKey.BracketLeft,
    BRACKETRIGHT: UiohookKey.BracketRight,
    MINUS: UiohookKey.Minus,
    EQUAL: UiohookKey.Equal,
    BACKQUOTE: UiohookKey.Backquote,
  }

  if (specialKeys[upper]) {
    return specialKeys[upper]
  }

  // F1-F24 功能键
  const fMatch = upper.match(/^F(\d+)$/)
  if (fMatch) {
    const fNum = parseInt(fMatch[1])
    if (fNum >= 1 && fNum <= 24) {
      const fKey = `F${fNum}` as keyof typeof UiohookKey
      if (UiohookKey[fKey] !== undefined) {
        return UiohookKey[fKey]
      }
    }
  }

  // 字母 A-Z
  if (/^[A-Z]$/.test(upper)) {
    const letterKey = upper as keyof typeof UiohookKey
    if (UiohookKey[letterKey] !== undefined) {
      return UiohookKey[letterKey]
    }
  }

  // 数字 0-9（主键盘区）
  if (/^[0-9]$/.test(upper)) {
    // UiohookKey 使用 Num0-Num9 表示主键盘数字
    const numKey = `Num${upper}` as keyof typeof UiohookKey
    if (UiohookKey[numKey] !== undefined) {
      return UiohookKey[numKey]
    }
    // 备用：直接尝试数字
    const directKey = upper as keyof typeof UiohookKey
    if (UiohookKey[directKey] !== undefined) {
      return UiohookKey[directKey]
    }
  }

  // 修饰键作为主键（组合键场景，如 Command+Control）
  if (lower === 'command' || lower === 'cmd' || lower === 'meta') {
    return UiohookKey.Meta
  }
  if (lower === 'control' || lower === 'ctrl') {
    return UiohookKey.Ctrl
  }
  if (lower === 'alt' || lower === 'option') {
    return UiohookKey.Alt
  }
  if (lower === 'shift') {
    return UiohookKey.Shift
  }

  return null
}

// 注册全局快捷键
function registerGlobalHotkeys() {
  const hotkeyConfig = configManager.getHotkeyConfig()
  const pttKey = hotkeyConfig.pttKey

  // PTT 逻辑：使用 iohook 监听按下与释放
  const pttConfig = parseAccelerator(pttKey)
  console.log({ pttConfig })

  if (pttConfig) {
    // 防抖计时器，防止快速按组合键时误触发
    let debounceTimer: NodeJS.Timeout | null = null
    const DEBOUNCE_MS = 50 // 50ms 确认期

    const checkPTT = () => {
      if (isFlashActive()) return
      // 判断是否按住设置的快捷键（精确匹配）
      const isPressed = ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key)

      // Start Recording（带防抖）
      if (
        isPressed &&
        (!currentSession || currentSession.status !== 'recording') &&
        !debounceTimer
      ) {
        // 设置防抖计时器，50ms 后再次确认
        debounceTimer = setTimeout(() => {
          // 再次检查是否仍然精确匹配
          if (ioHookManager.isPressed(pttConfig.modifiers, pttConfig.key)) {
            handleStartRecording()
          }
          debounceTimer = null
        }, DEBOUNCE_MS)
      }

      // 取消待确认的录音（精确匹配失败）
      if (!isPressed && debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }

      // Stop Recording
      if (!isPressed && currentSession && currentSession.status === 'recording') {
        handleStopRecording()
      }
    }

    ioHookManager.on('keydown', checkPTT)
    ioHookManager.on('keyup', checkPTT)
  }

  // 注册设置快捷键 (使用 Electron globalShortcut，因为是单次触发)
  hotkeyManager.register(hotkeyConfig.toggleSettings, () => {
    createSettingsWindow()
  })

  hotkeyManager.register(hotkeyConfig.flashNoteStart, () => {
    void startFlashSession().catch((error) => {
      console.error('[Main] Failed to start flash session:', error)
      showErrorAndHide(error instanceof Error ? error.message : t('errors.startFailed'))
    })
  })

  hotkeyManager.register(hotkeyConfig.flashNoteEnd, () => {
    void endFlashSession().catch((error) => {
      console.error('[Main] Failed to end flash session:', error)
      showErrorAndHide(error instanceof Error ? error.message : t('errors.stopFailed'))
    })
  })
}

// 处理开始录音
// 处理开始录音
async function handleStartRecording() {
  const startTimestamp = Date.now()
  console.log(`[Main] [${new Date().toISOString()}] handleStartRecording triggered`)
  if (isFlashActive() || recorderLockOwner === 'flash') {
    return
  }
  if (currentSession && currentSession.status === 'recording') {
    return
  }
  if (activeCaptureContext) {
    return
  }

  try {
    showOverlay({ status: 'recording' })
    currentSession = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      status: 'recording',
    }

    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      activeCaptureContext = {
        owner: 'ptt',
        sessionId: currentSession.id,
        startedAt: startTimestamp,
      }
      recorderLockOwner = 'ptt'
      console.log(`[Main] [${new Date().toISOString()}] Sending SESSION_START to backgroundWindow`)
      backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_START, { captureMode: 'ptt' })
      const duration = Date.now() - startTimestamp
      console.log(`[Main] ⏱️  Recording start completed in ${duration}ms`)
    } else {
      console.error('[Main] backgroundWindow is not available')
      showErrorAndHide(t('errors.internal'))
      currentSession = null
    }
  } catch (error) {
    console.error('[Main] Failed to start recording:', error)
    showErrorAndHide(t('errors.startFailed'))
    currentSession = null
  }
}

// 处理停止录音
async function handleStopRecording() {
  // 闪记录音没有 currentSession（PTT 专用）；浮层若仍调用 SESSION_STOP，则转为结束闪记
  if (isFlashActive()) {
    try {
      await endFlashSession()
    } catch (error) {
      console.error('[Main] endFlashSession (from SESSION_STOP) failed:', error)
      showErrorAndHide(error instanceof Error ? error.message : t('errors.stopFailed'))
    }
    return
  }

  if (!currentSession || currentSession.status !== 'recording') {
    console.log(
      '[Main] handleStopRecording called but no active session or not recording. Status:',
      currentSession?.status,
    )
    return
  }

  try {
    const recordingDuration = Date.now() - currentSession.startTime.getTime()
    console.log(`[Main] [${new Date().toISOString()}] handleStopRecording triggered`)
    console.log(`[Main] ⏱️  Recording duration: ${recordingDuration}ms`)
    currentSession.duration = recordingDuration
    currentSession.status = 'processing'
    updateOverlay({ status: 'processing' })

    if (backgroundWindow && !backgroundWindow.isDestroyed()) {
      if (activeCaptureContext?.owner === 'ptt') {
        stoppedCaptureContext = {
          ...activeCaptureContext,
          durationMs: recordingDuration,
        }
        activeCaptureContext = null
      }
      console.log(`[Main] [${new Date().toISOString()}] Sending SESSION_STOP to backgroundWindow`)
      backgroundWindow.webContents.send(IPC_CHANNELS.SESSION_STOP)
    } else {
      console.error('[Main] Cannot send SESSION_STOP: backgroundWindow not available')
      showErrorAndHide(t('errors.stopFailed'))
      stoppedCaptureContext = null
      if (recorderLockOwner === 'ptt') recorderLockOwner = 'none'
    }
  } catch (error) {
    console.error('[Main] Failed to stop recording:', error)
    showErrorAndHide(t('errors.stopFailed'))
    stoppedCaptureContext = null
    if (recorderLockOwner === 'ptt') recorderLockOwner = 'none'
  }
}

// 转换音频格式为 MP3
function convertToMP3(inputPath: string, outputPath: string): Promise<void> {
  const conversionStartTime = Date.now()
  return new Promise((resolve, reject) => {
    // 确保 ffmpeg 已初始化
    initializeFfmpeg()

    console.log(`[Main] [${new Date().toISOString()}] Converting audio to MP3...`)
    ffmpeg(inputPath)
      .toFormat('mp3')
      .audioCodec('libmp3lame')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioBitrate('64k')
      .on('end', () => {
        const conversionDuration = Date.now() - conversionStartTime
        console.log(`[Main] [${new Date().toISOString()}] Audio conversion completed`)
        console.log(`[Main] ⏱️  FFmpeg conversion took ${conversionDuration}ms`)
        resolve()
      })
      .on('error', (err: Error) => {
        const conversionDuration = Date.now() - conversionStartTime
        console.error(`[Main] Audio conversion failed after ${conversionDuration}ms:`, err)
        reject(err)
      })
      .save(outputPath)
  })
}

// 处理音频数据（来自渲染进程）
async function handlePTTAudioData(buffer: Buffer) {
  if (!currentSession) {
    console.log('[Main] Received audio data but no active session')
    return
  }

  const overallStartTime = Date.now()
  const timestamp = Date.now()
  const tempWebmPath = path.join(app.getPath('temp'), `voice-key-${timestamp}.webm`)
  const tempMp3Path = path.join(app.getPath('temp'), `voice-key-${timestamp}.mp3`)

  try {
    console.log(
      `[Main] [${new Date().toISOString()}] Received audio data size: ${buffer.length} bytes`,
    )
    const MIN_VALID_AUDIO_BYTES = 512
    if (buffer.length < MIN_VALID_AUDIO_BYTES) {
      throw new Error(t('errors.recordingDataMissing'))
    }
    if (buffer.length < 4000) {
      console.warn(
        `[Main] Audio buffer is very small (${buffer.length} bytes); recording may be silent or incomplete. Check mic and MediaRecorder.`,
      )
    }

    const saveStartTime = Date.now()
    console.log(
      `[Main] [${new Date().toISOString()}] Saving webm audio to temp file: ${tempWebmPath}`,
    )
    fs.writeFileSync(tempWebmPath, buffer)
    const saveDuration = Date.now() - saveStartTime
    console.log(`[Main] ⏱️  File save took ${saveDuration}ms`)

    const asrCfg = configManager.getASRConfig()
    let conversionDuration = 0
    let asrDuration = 0
    let transcription: Awaited<ReturnType<ASRProvider['transcribe']>>

    if (asrCfg.provider === 'qwen') {
      const webmSize = fs.statSync(tempWebmPath).size
      if (webmSize > DASHSCOPE.QWEN_SHORT_MAX_FILE_BYTES) {
        throw new Error(t('errors.qwenFileTooLarge'))
      }
      const erpResolved = configManager.getErpnextcnDtyResolvedForUpload()
      if (!erpResolved.apiKey.trim()) {
        throw new Error(t('errors.qwenNeedsErpnextUpload'))
      }
      const asrStartTime = Date.now()
      const qwenModelId = qwenShortAsrModelName(asrCfg.qwenRegion, asrCfg.qwenCnIntlFlashModel)
      const qwenRegionLabel = asrCfg.qwenRegion ?? 'cn'
      console.log(
        `[Main] [${new Date().toISOString()}] Qwen: ERPNextCN upload WebM/Opus then DashScope multimodal sync... (model=${qwenModelId}, dashscopeRegion=${qwenRegionLabel})`,
      )
      const uploadData = await uploadErpnextcnDtyFile(tempWebmPath, erpResolved, {
        contentType: 'audio/webm',
      })
      if (uploadData === null) {
        throw new Error(t('errors.qwenNeedsErpnextUpload'))
      }
      const publicUrl = fileUrlFromErpnextUploadResponse(uploadData)
      if (!publicUrl) {
        throw new Error(t('errors.qwenFileUrlMissing'))
      }
      try {
        transcription = await transcribeQwenFromFileUrl(asrCfg, publicUrl)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new Error(t('errors.qwenTranscriptionFailed', { message: detail }))
      }
      asrDuration = Date.now() - asrStartTime
    } else {
      const conversionStartTime = Date.now()
      await convertToMP3(tempWebmPath, tempMp3Path)
      conversionDuration = Date.now() - conversionStartTime
      console.log(`[Main] [${new Date().toISOString()}] Audio converted to MP3: ${tempMp3Path}`)
      console.log(`[Main] ⏱️  Total conversion process took ${conversionDuration}ms`)

      if (!asrProvider) {
        const initStartTime = Date.now()
        console.log(`[Main] [${new Date().toISOString()}] Initializing ASR provider...`)
        initializeASRProvider()
        if (!asrProvider) throw new Error('ASR Provider initialization failed')
        const initDuration = Date.now() - initStartTime
        console.log(`[Main] ⏱️  ASR initialization took ${initDuration}ms`)
      }

      const erpResolved = configManager.getErpnextcnDtyResolvedForUpload()
      const asrStartTime = Date.now()
      console.log(
        `[Main] [${new Date().toISOString()}] Parallel: ERPNextCN upload + ASR... (provider=glm, model=${GLM_ASR.MODEL})`,
      )

      const glmAsr = asrProvider
      if (!glmAsr) throw new Error('ASR Provider initialization failed')

      transcription = await Promise.all([
        uploadErpnextcnDtyMp3(tempMp3Path, erpResolved).catch((err: unknown) => {
          console.error('[Main] ERPNextCN upload failed (ignored for ASR/history):', err)
          return null
        }),
        (async () => {
          const tr = await glmAsr.transcribe(tempMp3Path)
          asrDuration = Date.now() - asrStartTime
          return tr
        })(),
      ]).then(([, tr]) => tr)
    }

    console.log(`[Main] [${new Date().toISOString()}] Transcription received`)
    console.log(`[Main] ASR model: ${transcription.model}`)
    console.log(`[Main] ⏱️  ASR transcription took ${asrDuration}ms`)
    console.log(
      '[Main] Transcription received (bytes):',
      Buffer.from(transcription.text).toString('hex'),
    )
    console.log('[Main] Transcription text:', transcription.text)

    currentSession.transcription = transcription.text
    currentSession.status = 'completed'

    const trimmedText = transcription.text.trim()
    let injectDuration = 0
    if (trimmedText.length > 0) {
      const resolved = await resolveTextForInjection(trimmedText)
      if (resolved.usedCommand) {
        console.log(`[Main] Voice command "${resolved.commandId}" applied`)
      }

      historyManager.add({
        text: resolved.text,
        duration: currentSession.duration,
      })

      const injectStartTime = Date.now()
      console.log(`[Main] [${new Date().toISOString()}] Injecting text...`)
      await textInjector.injectText(resolved.text)
      injectDuration = Date.now() - injectStartTime
      console.log(`[Main] ⏱️  Text injection took ${injectDuration}ms`)

      updateOverlay({ status: 'success' })
    } else {
      console.warn('[Main] ASR returned empty text; no injection or history entry')
      updateOverlay({
        status: 'success',
        message: t('errors.emptyTranscription'),
        noTextInjected: true,
      })
    }
    setTimeout(() => hideOverlay(), 800)

    const cleanupStartTime = Date.now()
    if (fs.existsSync(tempWebmPath)) fs.unlinkSync(tempWebmPath)
    if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path)
    const cleanupDuration = Date.now() - cleanupStartTime
    console.log(`[Main] [${new Date().toISOString()}] Temp files cleaned up`)
    console.log(`[Main] ⏱️  Cleanup took ${cleanupDuration}ms`)

    const overallDuration = Date.now() - overallStartTime
    console.log(`[Main] ⏱️  ========================================`)
    console.log(`[Main] ⏱️  TOTAL PROCESSING TIME: ${overallDuration}ms`)
    console.log(`[Main] ⏱️  Breakdown:`)
    console.log(
      `[Main] ⏱️    - File save: ${saveDuration}ms (${((saveDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Audio conversion: ${conversionDuration}ms (${((conversionDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - ASR transcription: ${asrDuration}ms (${((asrDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Text injection: ${injectDuration}ms (${((injectDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(
      `[Main] ⏱️    - Cleanup: ${cleanupDuration}ms (${((cleanupDuration / overallDuration) * 100).toFixed(1)}%)`,
    )
    console.log(`[Main] ⏱️  ========================================`)

    currentSession = null
    stoppedCaptureContext = null
    if (recorderLockOwner === 'ptt') recorderLockOwner = 'none'
  } catch (error) {
    const errorDuration = Date.now() - overallStartTime
    console.error(`[Main] Failed to process audio after ${errorDuration}ms:`, error)
    updateOverlay({
      status: 'error',
      message: error instanceof Error ? error.message : t('errors.generic'),
    })
    setTimeout(() => hideOverlay(), 2000)
    if (currentSession) {
      currentSession.status = 'error'
    }
    stoppedCaptureContext = null
    if (recorderLockOwner === 'ptt') recorderLockOwner = 'none'
    try {
      if (fs.existsSync(tempWebmPath)) fs.unlinkSync(tempWebmPath)
      if (fs.existsSync(tempMp3Path)) fs.unlinkSync(tempMp3Path)
    } catch (cleanupError) {
      console.error('[Main] Failed to cleanup temp files:', cleanupError)
    }
  }
}

async function processFlashChunkAudio(
  buffer: Buffer,
  context: Extract<CaptureContext, { owner: 'flash' }>,
): Promise<void> {
  const flashAudioDir = path.join(app.getPath('userData'), 'flash-note', 'audio', context.sessionId)
  if (!fs.existsSync(flashAudioDir)) {
    fs.mkdirSync(flashAudioDir, { recursive: true })
  }
  const audioPath = path.join(flashAudioDir, `${context.chunkId}.webm`)
  const asrCfg = configManager.getASRConfig()
  const erpResolved = configManager.getErpnextcnDtyResolvedForUpload()

  try {
    fs.writeFileSync(audioPath, buffer)
    updateFlashChunkStatus(context.chunkId, 'uploading')
    flashRepository.updateChunk({ chunkId: context.chunkId, status: 'uploading', audioPath })

    if (erpResolved.apiKey.trim().length === 0) {
      throw new Error(t('errors.qwenNeedsErpnextUpload'))
    }
    if (!asrCfg.qwenApiKey?.trim()) {
      throw new Error(t('settings.result.qwenApiKeyRequired'))
    }

    const uploadData = await uploadErpnextcnDtyFile(audioPath, erpResolved, {
      contentType: 'audio/webm',
    })
    if (uploadData === null) {
      throw new Error(t('errors.qwenNeedsErpnextUpload'))
    }
    const remoteUrl = fileUrlFromErpnextUploadResponse(uploadData)
    if (!remoteUrl) {
      throw new Error(t('errors.qwenFileUrlMissing'))
    }
    flashRepository.updateChunk({ chunkId: context.chunkId, status: 'transcribing', remoteUrl })
    updateFlashChunkStatus(context.chunkId, 'transcribing')

    const asrStartTime = Date.now()
    const transcription = await transcribeQwenFromFileUrl(
      {
        ...asrCfg,
        provider: 'qwen',
      },
      remoteUrl,
    )
    const asrDuration = Date.now() - asrStartTime
    const textRaw = transcription.text
    console.log(`[Main] [${new Date().toISOString()}] Flash chunk transcription received`, {
      sessionId: context.sessionId,
      chunkId: context.chunkId,
      model: transcription.model,
    })
    console.log(`[Main] ⏱️  Flash ASR transcription took ${asrDuration}ms`)
    console.log(
      '[Main] Flash transcription received (bytes):',
      Buffer.from(textRaw).toString('hex'),
    )
    console.log('[Main] Flash transcription text:', textRaw)

    flashRepository.updateChunk({
      chunkId: context.chunkId,
      status: 'success',
      transcript: textRaw.trim(),
      remoteUrl,
      audioPath,
      errorMessage: null,
    })
    notifyFlashStateChanged()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('errors.generic')
    flashRepository.updateChunk({
      chunkId: context.chunkId,
      status: 'failed',
      audioPath,
      errorMessage: message,
    })
    notifyFlashStateChanged()
    console.error('[Main] processFlashChunkAudio failed:', error)
  } finally {
    if (flashRuntime.isEnding) {
      await finalizeFlashSessionIfDone()
    }
  }
}

async function handleRecordedAudioData(buffer: Buffer): Promise<void> {
  const stopped = stoppedCaptureContext
  if (!stopped) {
    console.warn('[Main] Received audio data but no stopped capture context')
    return
  }

  if (stopped.owner === 'ptt') {
    await handlePTTAudioData(buffer)
    return
  }

  stoppedCaptureContext = null
  const shouldContinueRecording =
    !flashRuntime.isEnding &&
    flashRuntime.sessionId === stopped.sessionId &&
    activeCaptureContext === null

  if (shouldContinueRecording) {
    try {
      const sid = stopped.sessionId
      console.log('[Main] Scheduling next flash chunk capture:', {
        sessionId: sid,
        previousChunkId: stopped.chunkId,
        delayMs: FLASH_NEXT_CHUNK_DELAY_MS,
      })
      setTimeout(() => {
        try {
          beginFlashChunkCapture(sid)
        } catch (error) {
          console.error('[Main] Failed to continue flash recording after chunk stop:', error)
        }
      }, FLASH_NEXT_CHUNK_DELAY_MS)
    } catch (error) {
      console.error('[Main] Failed to schedule flash chunk continuation:', error)
    }
  } else {
    updateOverlay({
      status: 'processing',
      mode: 'flash',
      sessionId: stopped.sessionId,
    })
  }

  await processFlashChunkAudio(buffer, stopped)
}

// 显示系统通知
function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
    }).show()
  }
}

// IPC处理器
function setupIPCHandlers() {
  // 配置相关
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, () => {
    return configManager.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config) => {
    if (config.app) {
      configManager.setAppConfig(config.app)
      if (typeof config.app.autoLaunch === 'boolean') {
        updateAutoLaunchState(config.app.autoLaunch)
      }
      await setMainLanguage(config.app.language)
      refreshLocalizedUi()
    }
    if (config.asr) {
      configManager.setASRConfig(config.asr)
      initializeASRProvider()
    }
    if (config.hotkey) {
      configManager.setHotkeyConfig(config.hotkey)
      // 重新注册快捷键：先清除所有监听器
      hotkeyManager.unregisterAll()
      ioHookManager.removeAllListeners('keydown')
      ioHookManager.removeAllListeners('keyup')
      registerGlobalHotkeys()
      console.log('[Main] Hotkeys re-registered with new config:', config.hotkey)
    }
    if (config.erpnextcnDty) {
      configManager.setErpnextcnDtyConfig(config.erpnextcnDty)
    }
    if (config.textLlm) {
      configManager.setTextLlmConfig(config.textLlm)
    }
    if (config.voiceCommands) {
      configManager.setVoiceCommandsConfig(config.voiceCommands)
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_TEST, async (_event, config?: ASRConfig) => {
    const cfg = config ?? configManager.getASRConfig()
    if (cfg.provider === 'qwen') {
      return await testQwenDashScopeConnection(cfg)
    }
    if (config) {
      const tempProvider = new ASRProvider(cfg)
      return await tempProvider.testConnection()
    }
    if (!asrProvider) {
      return false
    }
    return await asrProvider.testConnection()
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_TEST_TEXT_LLM, async (_event, config?: TextLlmConfig) => {
    const cfg = config ?? configManager.getTextLlmConfig()
    return await probeTextLlmConnection(cfg)
  })

  ipcMain.handle(
    IPC_CHANNELS.CRAFTSMAN_CHAT,
    async (_event, payload: CraftsmanChatPayload): Promise<CraftsmanChatResult> => {
      return await runCraftsmanChat(payload)
    },
  )

  ipcMain.handle(IPC_CHANNELS.DIAGNOSTICS_RUN, async (): Promise<DiagnosticsRunResult> => {
    return await runMainProcessDiagnostics(
      configManager.getASRConfig(),
      configManager.getTextLlmConfig(),
      configManager.getErpnextcnDtyFromStore(),
    )
  })

  // 会话相关
  ipcMain.handle(IPC_CHANNELS.SESSION_START, async () => {
    await handleStartRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STOP, async () => {
    await handleStopRecording()
  })

  ipcMain.handle(IPC_CHANNELS.SESSION_STATUS, () => {
    return currentSession?.status || 'idle'
  })

  // 闪记相关
  ipcMain.handle(IPC_CHANNELS.FLASH_GET_SESSIONS, () => {
    return flashRepository.getSessionsWithChunks(200)
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_GET_ACTIVE_SESSION, () => {
    return flashRepository.getActiveSession()
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_START, async () => {
    return await startFlashSession()
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_END, async () => {
    await endFlashSession()
  })

  ipcMain.handle(
    IPC_CHANNELS.FLASH_UPDATE_SUMMARY,
    (_event, sessionId: string, summary: string) => {
      flashRepository.updateSessionSummary(sessionId, summary)
      notifyFlashStateChanged()
    },
  )

  const FLASH_SUMMARY_CORPUS_MAX_CHARS = 200_000

  ipcMain.handle(
    IPC_CHANNELS.FLASH_GENERATE_SUMMARY,
    async (_event, payload: FlashGenerateSummaryPayload): Promise<FlashGenerateSummaryResult> => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
      const systemPrompt =
        typeof payload?.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
      if (!sessionId) {
        return { ok: false, code: 'session_not_found' }
      }
      if (!systemPrompt) {
        return { ok: false, code: 'request_failed', message: 'Empty system prompt' }
      }

      const textLlm = configManager.getTextLlmConfig()
      if (!textLlm.apiKey?.trim()) {
        return { ok: false, code: 'no_api_key' }
      }

      const session = flashRepository.getSessionWithChunksById(sessionId)
      if (!session) {
        return { ok: false, code: 'session_not_found' }
      }
      if (session.status === 'recording' || session.status === 'flushing') {
        return { ok: false, code: 'session_active' }
      }

      const sorted = [...session.chunks].sort((a, b) => a.chunkIndex - b.chunkIndex)
      const blocks: string[] = []
      for (const ch of sorted) {
        if (ch.status !== 'success') continue
        const tr = ch.transcript?.trim()
        if (!tr) continue
        blocks.push(`【录音 ${ch.chunkIndex}】\n${tr}`)
      }
      if (blocks.length === 0) {
        return { ok: false, code: 'no_transcript' }
      }

      let userContent = `以下是本条闪记下各段录音的转写（按时间顺序）。请根据这些内容生成总结。\n\n${blocks.join('\n\n')}`
      if (userContent.length > FLASH_SUMMARY_CORPUS_MAX_CHARS) {
        console.warn(
          `[flash-summary] Corpus truncated from ${userContent.length} to ${FLASH_SUMMARY_CORPUS_MAX_CHARS} chars`,
        )
        userContent = `${userContent.slice(0, FLASH_SUMMARY_CORPUS_MAX_CHARS)}\n\n[内容已截断]`
      }

      try {
        const summaryText = await generateTextWithTextLlm(textLlm, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ])
        const trimmed = summaryText.trim()
        if (!trimmed) {
          return { ok: false, code: 'empty_response' }
        }
        flashRepository.updateSessionSummary(sessionId, trimmed)
        notifyFlashStateChanged()
        return { ok: true, summary: trimmed }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, code: 'request_failed', message }
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.FLASH_DOWNLOAD_CHUNK, async (_event, chunkId: string) => {
    const chunk = flashRepository.getChunk(chunkId)
    if (!chunk?.audioPath || !fs.existsSync(chunk.audioPath)) {
      return { savedPath: null }
    }
    const defaultFileName = path.basename(chunk.audioPath)
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), defaultFileName),
      filters: [{ name: 'Audio', extensions: ['webm', 'opus', 'ogg'] }],
    })
    if (result.canceled || !result.filePath) {
      return { savedPath: null }
    }
    fs.copyFileSync(chunk.audioPath, result.filePath)
    return { savedPath: result.filePath }
  })

  ipcMain.handle(IPC_CHANNELS.FLASH_PLAY_CHUNK, async (_event, chunkId: string) => {
    const chunk = flashRepository.getChunk(chunkId)
    if (!chunk?.audioPath || !fs.existsSync(chunk.audioPath)) {
      return
    }
    await shell.openPath(chunk.audioPath)
  })

  // 历史记录相关
  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, () => historyManager.getAll())
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, () => historyManager.clear())
  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_event, id) => historyManager.delete(id))

  // 接收音频数据
  ipcMain.on(IPC_CHANNELS.AUDIO_DATA, (_event, buffer) => {
    void handleRecordedAudioData(Buffer.from(buffer))
  })

  ipcMain.on(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, (_event, level: number) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, level)
    }
  })

  ipcMain.on(
    'set-ignore-mouse-events',
    (_event, ignore: boolean, options?: { forward?: boolean }) => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setIgnoreMouseEvents(ignore, options)
      }
    },
  )

  // 窗口控制（Windows/Linux）
  ipcMain.on('window:minimize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.minimize()
    }
  })

  ipcMain.on('window:maximize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMaximized()) {
        settingsWindow.unmaximize()
      } else {
        settingsWindow.maximize()
      }
    }
  })

  ipcMain.on('window:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close()
    }
  })

  ipcMain.on('error', (_event, error) => {
    console.error('[Main] 🔴 Renderer Error received:', error)
    console.error('[Main] 🔴 Error type:', typeof error)
    console.error('[Main] 🔴 Current session status:', currentSession?.status)
    showNotification(t('notification.errorTitle'), error)
    if (currentSession) currentSession.status = 'error'
  })

  // 更新相关
  ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
    return await UpdaterManager.checkForUpdates()
  })

  ipcMain.handle(IPC_CHANNELS.GET_UPDATE_STATUS, () => {
    return UpdaterManager.getLastUpdateInfo()
  })

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC_CHANNELS.GET_IS_PACKAGED, () => {
    return app.isPackaged
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, (_event, url) => {
    UpdaterManager.openReleasePage(url)
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_UPDATE, async () => {
    try {
      await UpdaterManager.downloadUpdate()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async () => {
    try {
      await UpdaterManager.installUpdate()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // 网络相关
  ipcMain.handle(IPC_CHANNELS.GET_LOCAL_IP, () => {
    const interfaces = os.networkInterfaces()
    const ips: string[] = []

    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue

      for (const addr of iface) {
        // 跳过内部（非IPv4）和回环地址
        if (addr.family === 'IPv4' && !addr.internal) {
          ips.push(addr.address)
        }
      }
    }

    // 返回第一个找到的IP地址，如果没有则返回空字符串
    return ips[0] || ''
  })
}

function recoverFlashSessionIfNeeded(): void {
  const active = flashRepository.getActiveSession()
  if (!active) return

  console.log('[Main] Recovering flash session:', active.sessionId)
  flashRuntime.sessionId = active.sessionId
  flashRuntime.startedAt = new Date(active.startedAt).getTime()
  flashRuntime.isEnding = false
  flashRuntime.chunkIndex = active.chunks.length
  flashRepository.updateSessionStatus(active.sessionId, 'recording')
  notifyFlashStateChanged()
  beginFlashChunkCapture(active.sessionId)
}

// 应用程序生命周期
app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  // 初始化
  const appConfig = configManager.getAppConfig()
  await initMainI18n(appConfig.language)
  updateAutoLaunchState(appConfig.autoLaunch ?? false)
  initializeASRProvider()
  createMainWindow()
  createTray()
  setupIPCHandlers()
  // 初始化 UpdaterManager（需要在 createMainWindow 之后，因为需要主窗口引用）
  if (backgroundWindow) {
    UpdaterManager.initialize(backgroundWindow)
  }
  void UpdaterManager.checkForUpdates()
  registerGlobalHotkeys()
  ioHookManager.start()

  // 启动 HTTP 服务器（监听 0.0.0.0，允许局域网访问）
  try {
    await startHttpServer(4321, '0.0.0.0')
  } catch (error) {
    console.error('[Main] HTTP 服务器启动失败:', error)
  }

  // 设置 Dock 图标和应用名称（macOS）
  if (process.platform === 'darwin') {
    app.setName(t('app.name'))
    const dockIconPath = path.join(process.env.VITE_PUBLIC, 'voice-key-dock-icon.png')
    app.dock.setIcon(nativeImage.createFromPath(dockIconPath))
  }

  // 开发环境下自动打开设置窗口
  if (VITE_DEV_SERVER_URL) {
    createSettingsWindow()
  }

  // 检查权限（macOS）
  if (process.platform === 'darwin') {
    textInjector.checkPermissions().then((result) => {
      if (!result.hasPermission && result.message) {
        showNotification(t('notification.permissionTitle'), result.message)
      }
    })
  }
})

app.on('window-all-closed', () => {
  // MVP版本：即使关闭所有窗口也继续运行（托盘应用）
  // 用户需要从托盘退出
})

app.on('before-quit', async () => {
  // 清理资源
  clearFlashTimers()
  hotkeyManager.unregisterAll()
  ioHookManager.stop()
  flashRepository.close()
  await stopHttpServer()
})

app.on('activate', () => {
  // macOS: 点击 Dock 图标时打开设置窗口
  if (BrowserWindow.getAllWindows().length === 0 || !settingsWindow) {
    createSettingsWindow()
  } else if (settingsWindow) {
    settingsWindow.focus()
  }
})
