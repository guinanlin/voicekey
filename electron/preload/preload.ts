import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  OverlayState,
  HistoryItem,
  AppConfig,
  ASRConfig,
  UpdateInfo,
  FlashSessionWithChunks,
  FlashGenerateSummaryResult,
  DiagnosticsRunResult,
  SessionStartPayload,
  TextLlmConfig,
  TextLlmProbeResult,
  CraftsmanChatPayload,
  CraftsmanChatResult,
  HistoryCraftsmanChatSavePayload,
  HistoryCraftsmanChatSession,
  VoiceCommandId,
} from '../shared/types'

// 定义暴露给渲染进程的API接口
export interface ElectronAPI {
  // 系统信息
  platform: string

  // 窗口控制（Windows/Linux）
  minimizeWindow?: () => void
  maximizeWindow?: () => void
  closeWindow?: () => void

  // 配置相关
  getConfig: () => Promise<AppConfig>
  setConfig: (config: Partial<AppConfig>) => Promise<void>
  testConnection: (config?: ASRConfig) => Promise<boolean>
  testTextLlmConnection: (config?: TextLlmConfig) => Promise<TextLlmProbeResult>
  craftsmanChat: (payload: CraftsmanChatPayload) => Promise<CraftsmanChatResult>
  runDiagnostics: () => Promise<DiagnosticsRunResult>

  // 录音会话相关
  startSession: () => Promise<void>
  stopSession: () => Promise<void>
  getSessionStatus: () => Promise<string>

  // 历史记录相关
  getHistory: () => Promise<HistoryItem[]>
  clearHistory: () => Promise<void>
  deleteHistoryItem: (id: string) => Promise<void>
  getHistoryCraftsmanChat: (
    historyItemId: string,
    commandId: VoiceCommandId,
  ) => Promise<HistoryCraftsmanChatSession | null>
  saveHistoryCraftsmanChat: (
    payload: HistoryCraftsmanChatSavePayload,
  ) => Promise<HistoryCraftsmanChatSession | null>
  onHistoryChanged: (callback: () => void) => () => void

  // 闪记相关
  getFlashSessions: () => Promise<FlashSessionWithChunks[]>
  getActiveFlashSession: () => Promise<FlashSessionWithChunks | null>
  startFlashSession: () => Promise<{ sessionId: string }>
  endFlashSession: () => Promise<void>
  updateFlashSummary: (sessionId: string, summary: string) => Promise<void>
  generateFlashSummary: (
    sessionId: string,
    systemPrompt: string,
  ) => Promise<FlashGenerateSummaryResult>
  downloadFlashChunk: (chunkId: string) => Promise<{ savedPath: string | null }>
  playFlashChunk: (chunkId: string) => Promise<void>
  onFlashStateChanged: (callback: () => void) => () => void

  // 快捷键相关
  registerHotkey: (accelerator: string) => Promise<boolean>
  unregisterHotkey: (accelerator: string) => Promise<void>

  // 事件监听
  onSessionStatus: (callback: (status: string) => void) => () => void
  onTranscription: (callback: (text: string) => void) => () => void
  onError: (callback: (error: string) => void) => () => void

  onStartRecording: (callback: (payload?: SessionStartPayload) => void) => () => void
  onStopRecording: (callback: () => void) => () => void
  sendAudioData: (buffer: ArrayBuffer) => void
  sendError: (error: string) => void
  sendAudioLevel: (level: number) => void

  onOverlayUpdate: (callback: (state: OverlayState) => void) => () => void
  onAudioLevel: (callback: (level: number) => void) => () => void

  // Overlay mouse event handling
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void

  // 更新相关
  checkForUpdates: () => Promise<UpdateInfo>
  getUpdateStatus: () => Promise<UpdateInfo | null>
  getAppVersion: () => Promise<string>
  getIsPackaged: () => Promise<boolean>
  openExternal: (url: string) => Promise<void>
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  installUpdate: () => Promise<{ success: boolean; error?: string }>

  // 网络相关
  getLocalIP: () => Promise<string>
  onUpdateDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void,
  ) => () => void
  onUpdateAvailable: (callback: (event: string, data?: UpdateInfo) => void) => () => void
  onUpdateDownloaded: (callback: (data?: UpdateInfo) => void) => () => void
  onUpdateError: (callback: (data?: UpdateInfo) => void) => () => void
}

// 暴露安全的API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 系统信息
  platform: process.platform,

  // 窗口控制（Windows/Linux）
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // 配置相关
  getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  setConfig: (config: Partial<AppConfig>) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),
  testConnection: (config?: ASRConfig) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_TEST, config),
  testTextLlmConnection: (config?: TextLlmConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFIG_TEST_TEXT_LLM, config),
  craftsmanChat: (payload: CraftsmanChatPayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.CRAFTSMAN_CHAT, payload),
  runDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.DIAGNOSTICS_RUN),

  // 录音会话相关
  startSession: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_START),
  stopSession: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),
  getSessionStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SESSION_STATUS),

  // 历史记录相关
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  deleteHistoryItem: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),
  getHistoryCraftsmanChat: (historyItemId: string, commandId: VoiceCommandId) =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET_CRAFTSMAN_CHAT, historyItemId, commandId),
  saveHistoryCraftsmanChat: (payload: HistoryCraftsmanChatSavePayload) =>
    ipcRenderer.invoke(IPC_CHANNELS.HISTORY_SAVE_CRAFTSMAN_CHAT, payload),
  onHistoryChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.HISTORY_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.HISTORY_CHANGED, listener)
  },

  // 闪记相关
  getFlashSessions: () => ipcRenderer.invoke(IPC_CHANNELS.FLASH_GET_SESSIONS),
  getActiveFlashSession: () => ipcRenderer.invoke(IPC_CHANNELS.FLASH_GET_ACTIVE_SESSION),
  startFlashSession: () => ipcRenderer.invoke(IPC_CHANNELS.FLASH_START),
  endFlashSession: () => ipcRenderer.invoke(IPC_CHANNELS.FLASH_END),
  updateFlashSummary: (sessionId: string, summary: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FLASH_UPDATE_SUMMARY, sessionId, summary),
  generateFlashSummary: (sessionId: string, systemPrompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FLASH_GENERATE_SUMMARY, { sessionId, systemPrompt }),
  downloadFlashChunk: (chunkId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FLASH_DOWNLOAD_CHUNK, chunkId),
  playFlashChunk: (chunkId: string) => ipcRenderer.invoke(IPC_CHANNELS.FLASH_PLAY_CHUNK, chunkId),
  onFlashStateChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.FLASH_STATE_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FLASH_STATE_CHANGED, listener)
  },

  // 快捷键相关
  registerHotkey: (accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_REGISTER, accelerator),
  unregisterHotkey: (accelerator: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOTKEY_UNREGISTER, accelerator),

  // 事件监听
  onSessionStatus: (callback: (status: string) => void) => {
    const listener = (_event: IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on(IPC_CHANNELS.SESSION_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STATUS, listener)
  },
  onTranscription: (callback: (text: string) => void) => {
    const listener = (_event: IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('transcription:result', listener)
    return () => ipcRenderer.removeListener('transcription:result', listener)
  },
  onError: (callback: (error: string) => void) => {
    const listener = (_event: IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('error', listener)
    return () => ipcRenderer.removeListener('error', listener)
  },

  // [NEW] Audio Recording (Main -> Renderer)
  onStartRecording: (callback: (payload?: SessionStartPayload) => void) => {
    const listener = (_event: IpcRendererEvent, payload?: SessionStartPayload) => {
      console.log('[Preload] Received SESSION_START', payload)
      callback(payload)
    }
    ipcRenderer.on(IPC_CHANNELS.SESSION_START, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_START, listener)
  },
  onStopRecording: (callback: () => void) => {
    const listener = () => {
      console.log('[Preload] Received SESSION_STOP')
      callback()
    }
    ipcRenderer.on(IPC_CHANNELS.SESSION_STOP, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SESSION_STOP, listener)
  },

  sendAudioData: (buffer: ArrayBuffer) => {
    ipcRenderer.send('audio:data', buffer)
  },
  sendError: (error: string) => {
    ipcRenderer.send('error', error)
  },
  sendAudioLevel: (level: number) => {
    ipcRenderer.send(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, level)
  },

  onOverlayUpdate: (callback: (state: OverlayState) => void) => {
    const listener = (_event: IpcRendererEvent, state: OverlayState) => callback(state)
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_UPDATE, listener)
  },
  onAudioLevel: (callback: (level: number) => void) => {
    const listener = (_event: IpcRendererEvent, level: number) => callback(level)
    ipcRenderer.on(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.OVERLAY_AUDIO_LEVEL, listener)
  },

  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options)
  },

  // 更新相关
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
  getUpdateStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_UPDATE_STATUS),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.GET_APP_VERSION),
  getIsPackaged: () => ipcRenderer.invoke(IPC_CHANNELS.GET_IS_PACKAGED),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_UPDATE),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),
  getLocalIP: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LOCAL_IP),
  onUpdateDownloadProgress: (
    callback: (progress: { percent: number; transferred: number; total: number }) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      progress: { percent: number; transferred: number; total: number },
    ) => callback(progress)
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE_DOWNLOAD_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE_DOWNLOAD_PROGRESS, listener)
  },
  onUpdateAvailable: (callback: (event: string, data?: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, event: string, data?: UpdateInfo) =>
      callback(event, data)
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
  },
  onUpdateDownloaded: (callback: (data?: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, event: string, data?: UpdateInfo) => {
      if (event === 'downloaded') callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
  },
  onUpdateError: (callback: (data?: UpdateInfo) => void) => {
    const listener = (_event: IpcRendererEvent, event: string, data?: UpdateInfo) => {
      if (event === 'error') callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.ON_UPDATE_AVAILABLE, listener)
  },
} as ElectronAPI)
