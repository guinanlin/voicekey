// 跨进程共享的类型定义

import type { LanguageSetting } from './i18n'

export interface VoiceSession {
  id: string
  startTime: Date
  status: 'recording' | 'processing' | 'completed' | 'error'
  audioData?: Buffer
  transcription?: string
  error?: string
  duration?: number
}

export interface ASRConfig {
  provider: 'glm'
  region: 'cn' | 'intl'
  apiKeys: {
    cn: string
    intl: string
  }

  // Deprecated: for backward compatibility during migration
  apiKey?: string

  endpoint?: string
  language?: string
}

export interface HotkeyConfig {
  pttKey: string
  toggleSettings: string
}

export interface AppPreferences {
  language: LanguageSetting
  autoLaunch?: boolean
}

export interface AppConfig {
  app: AppPreferences
  asr: ASRConfig
  hotkey: HotkeyConfig
}

export interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

export type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfo {
  hasUpdate: boolean
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  error?: string
  // 新增字段用于自动更新
  status?: UpdateStatus
  downloadProgress?: {
    percent: number
    transferred: number
    total: number
  }
}

// IPC 通道定义
export const IPC_CHANNELS = {
  // 配置相关
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST: 'config:test',

  // 录音会话相关
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_STATUS: 'session:status',
  AUDIO_DATA: 'audio:data', // [NEW] Renderer -> Main (Audio Buffer)
  ERROR: 'error', // [NEW] Renderer -> Main (Error)

  // 快捷键相关
  HOTKEY_REGISTER: 'hotkey:register',
  HOTKEY_UNREGISTER: 'hotkey:unregister',

  // 通知相关
  NOTIFICATION_SHOW: 'notification:show',

  // Overlay 相关
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_UPDATE: 'overlay:update',
  OVERLAY_AUDIO_LEVEL: 'overlay:audio-level',

  // 历史记录相关
  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_DELETE: 'history:delete',

  // 更新相关
  CHECK_FOR_UPDATES: 'update:check',
  GET_UPDATE_STATUS: 'update:get-status',
  GET_APP_VERSION: 'app:version',
  GET_IS_PACKAGED: 'app:is-packaged',
  OPEN_EXTERNAL: 'app:open-external',
  DOWNLOAD_UPDATE: 'update:download',
  INSTALL_UPDATE: 'update:install',
  ON_UPDATE_DOWNLOAD_PROGRESS: 'update:download-progress',
  ON_UPDATE_AVAILABLE: 'update:available',
  ON_UPDATE_DOWNLOADED: 'update:downloaded',
  ON_UPDATE_ERROR: 'update:error',
} as const

export type OverlayStatus = 'recording' | 'processing' | 'success' | 'error'

export interface OverlayState {
  status: OverlayStatus
  message?: string
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
