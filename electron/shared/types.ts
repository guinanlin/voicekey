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

/** 中国大陆 / 国际（新加坡）地域下的千问 Flash 模型；美国地域固定为 qwen3-asr-flash-us */
export type QwenCnIntlFlashModelId = 'qwen3-asr-flash' | 'qwen3-asr-flash-2026-02-10'

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
  /** cn/intl 下选用的 Flash 模型 ID；未设置时等同 qwen3-asr-flash */
  qwenCnIntlFlashModel?: QwenCnIntlFlashModelId
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

/** 闪记「总结」IPC 入参（system 提示词由渲染进程按界面语言传入） */
export interface FlashGenerateSummaryPayload {
  sessionId: string
  systemPrompt: string
}

/** 与 `sketches.summaryError.*` 文案键一一对应（`request_failed` 另带 message） */
export type FlashGenerateSummaryErrorCode =
  | 'no_api_key'
  | 'session_not_found'
  | 'session_active'
  | 'no_transcript'
  | 'empty_response'
  | 'request_failed'

/** 闪记「总结」IPC 返回 */
export type FlashGenerateSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; code: FlashGenerateSummaryErrorCode; message?: string }

/** 文本 LLM 渠道：阿里云百炼 DashScope / 天翼云 Wishub */
export type TextLlmProvider = 'aliyun' | 'ctyun'

/** 天翼云 Wishub 推理集群（wishub-x*.ctyun.cn） */
export type CtyunWishubRegion = 'x1' | 'x5' | 'x6'

/** 文本 LLM 区域：阿里云 cn/intl/us；天翼云 x1/x5/x6 */
export type TextLlmRegion = 'cn' | 'intl' | 'us' | CtyunWishubRegion

/** 文本对话（默认 OpenAI 兼容 chat/completions；阿里云可选手写旧版 text-generation URL） */
export interface TextLlmConfig {
  /** 渠道来源，默认 aliyun（兼容旧配置） */
  provider: TextLlmProvider
  /**
   * 请求体 `model` 字段：阿里云即模型名（如 qwen-plus）；
   * 天翼云为控制台 Model ID（如 f23c54bf…，opaque hex）。
   */
  model: string
  /** 天翼云专用：可读模型名（如 DeepSeek V4 Flash），仅展示/备注，不参与 API 请求 */
  modelName?: string
  /** 区域：阿里云 cn/intl/us；天翼云 x1/x5/x6 */
  region: TextLlmRegion
  apiKey: string
  /**
   * 完整请求 URL。留空则按 provider + region 使用官方默认地址。
   * 阿里云若填写含 `.../text-generation/generation` 的地址，则走旧版 DashScope 协议。
   */
  generationUrl?: string
}

export type TextLlmProbeCode =
  | 'ok'
  | 'no_key'
  | 'no_model'
  | 'auth'
  | 'endpoint'
  | 'network'
  | 'unknown'

export interface TextLlmProbeResult {
  ok: boolean
  code: TextLlmProbeCode
  detail?: string
}

/** 语音指令 ID；与设置页、PTT 命令词一一对应 */
export type VoiceCommandId = 'polish' | 'summary' | 'translate' | 'wechat' | 'twitter' | 'email'

/** 单条语音指令：触发词 + 系统 Prompt */
export interface VoiceCommandItem {
  id: VoiceCommandId
  trigger: string
  prompt: string
}

/** 设置页「指令」Tab 持久化结构 */
export interface VoiceCommandsConfig {
  commands: VoiceCommandItem[]
}

export interface AppConfig {
  app: AppPreferences
  asr: ASRConfig
  hotkey: HotkeyConfig
  erpnextcnDty: ErpnextcnDtyConfig
  textLlm: TextLlmConfig
  voiceCommands: VoiceCommandsConfig
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

/** 设置页「诊断」分项 id（麦克风由渲染进程检测后合并） */
export type DiagnosticItemId = 'network' | 'microphone' | 'asr' | 'textLlm' | 'erpnextUpload'

export type DiagnosticItemStatus = 'ok' | 'fail' | 'skip'

export interface DiagnosticItem {
  id: DiagnosticItemId
  status: DiagnosticItemStatus
  /** 相对 `settings.` 的 i18n 后缀，如 `diagnostics.network.ok` */
  messageKey?: string
  messageParams?: Record<string, string>
}

/** 主进程 `DIAGNOSTICS_RUN` 返回（不含 microphone，由 UI 合并） */
export interface DiagnosticsRunResult {
  ranAt: string
  items: DiagnosticItem[]
}

/** 工匠聊天消息角色（不含 system，system 单独传） */
export type CraftsmanChatRole = 'user' | 'assistant'

export interface CraftsmanChatMessage {
  role: CraftsmanChatRole
  content: string
}

export interface CraftsmanChatPayload {
  systemPrompt: string
  /** 不含 system；含当前待回复的 user 消息 */
  messages: CraftsmanChatMessage[]
}

export interface CraftsmanChatResult {
  ok: boolean
  content?: string
  code?: 'no_api_key' | 'empty_response' | 'request_failed'
  message?: string
}

// IPC 通道定义
export const IPC_CHANNELS = {
  // 配置相关
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_TEST: 'config:test',
  CONFIG_TEST_TEXT_LLM: 'config:test-text-llm',
  DIAGNOSTICS_RUN: 'diagnostics:run',

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

  // 工匠聊天
  CRAFTSMAN_CHAT: 'craftsman:chat',

  // 闪记相关
  FLASH_GET_SESSIONS: 'flash:get-sessions',
  FLASH_GET_ACTIVE_SESSION: 'flash:get-active-session',
  FLASH_START: 'flash:start',
  FLASH_END: 'flash:end',
  FLASH_UPDATE_SUMMARY: 'flash:update-summary',
  FLASH_GENERATE_SUMMARY: 'flash:generate-summary',
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
