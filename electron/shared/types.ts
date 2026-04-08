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

export type ASRProviderId = 'glm' | 'qwen'

export interface ASRConfig {
  /** 当前用于语音转写的后端 */
  provider: ASRProviderId
  region: 'cn' | 'intl'
  apiKeys: {
    cn: string
    intl: string
  }

  // Deprecated: for backward compatibility during migration
  apiKey?: string

  endpoint?: string
  language?: string

  /** 阿里云 DashScope（千问 ASR），与 GLM 二选一使用 */
  qwenApiKey?: string
  /** cn=北京；intl=新加坡；us=美国（弗吉尼亚），模型为 qwen3-asr-flash-us */
  qwenRegion?: 'cn' | 'intl' | 'us'
  /** 千问同步 multimodal-generation 完整 URL；留空则按 qwenRegion 使用官方默认地址 */
  qwenSubmitUrl?: string
}

export interface HotkeyConfig {
  pttKey: string
  flashNoteStart: string
  flashNoteEnd: string
  toggleSettings: string
}

export type RecorderLockOwner = 'none' | 'ptt' | 'flash'

export type FlashSessionStatus = 'recording' | 'flushing' | 'completed' | 'failed'
export type FlashChunkStatus =
  | 'recording'
  | 'pending'
  | 'uploading'
  | 'transcribing'
  | 'success'
  | 'failed'

export interface FlashSession {
  sessionId: string
  startedAt: string
  endedAt: string | null
  status: FlashSessionStatus
  summary: string | null
  createdAt: string
  updatedAt: string
}

export interface FlashChunk {
  chunkId: string
  sessionId: string
  chunkIndex: number
  startedAt: string
  endedAt: string
  audioPath: string | null
  remoteUrl: string | null
  status: FlashChunkStatus
  transcript: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface FlashSessionWithChunks extends FlashSession {
  chunks: FlashChunk[]
}

/** 主进程通过 SESSION_START 告知后台录音窗口当前采集场景 */
export type SessionCaptureMode = 'ptt' | 'flash'

export interface SessionStartPayload {
  captureMode: SessionCaptureMode
}

/** 应用内麦克风采集与 MediaRecorder 参数（设置页「应用偏好」可配） */
export interface AudioCapturePreferences {
  /** WebM/Opus 目标码率（bps），过小可能影响识别 */
  opusBitsPerSecond: number
  /** 优先单声道以减小体积 */
  preferMono: boolean
  echoCancellation: boolean
  noiseSuppression: boolean
  /** 自动增益控制（AGC）：提升远场/外放可收录性；过强时人声可能更“顶” */
  autoGainControl: boolean
  /** 约束失败时回退为 `{ audio: true }` */
  fallbackOnMicConstraintFailure: boolean
}

export interface AppPreferences {
  language: LanguageSetting
  autoLaunch?: boolean
  audioCapture?: AudioCapturePreferences
}

/** ERPNextCN DTY：可选音频归档上传；在设置页配置 host 与 API Key */
export interface ErpnextcnDtyConfig {
  host: string
  apiKey: string
}

export interface AppConfig {
  app: AppPreferences
  asr: ASRConfig
  hotkey: HotkeyConfig
  erpnextcnDty: ErpnextcnDtyConfig
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
  HISTORY_CHANGED: 'history:changed',

  // 闪记相关
  FLASH_GET_SESSIONS: 'flash:get-sessions',
  FLASH_GET_ACTIVE_SESSION: 'flash:get-active-session',
  FLASH_START: 'flash:start',
  FLASH_END: 'flash:end',
  FLASH_UPDATE_SUMMARY: 'flash:update-summary',
  FLASH_DOWNLOAD_CHUNK: 'flash:download-chunk',
  FLASH_PLAY_CHUNK: 'flash:play-chunk',
  FLASH_STATE_CHANGED: 'flash:state-changed',

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

  // 网络相关
  GET_LOCAL_IP: 'network:get-local-ip',
} as const

export type OverlayStatus = 'recording' | 'processing' | 'success' | 'error'

export type OverlayMode = 'ptt' | 'flash'

export interface OverlayState {
  status: OverlayStatus
  mode?: OverlayMode
  message?: string
  elapsedSeconds?: number
  sessionId?: string
  /** 成功结束但无可插入文本（如 ASR 返回空），HUD 不显示「已注入」 */
  noTextInjected?: boolean
}

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
