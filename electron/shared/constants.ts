// 共享常量

import type {
  AudioCapturePreferences,
  QwenCnIntlFlashModelId,
  TextLlmProvider,
  TextLlmRegion,
} from './types'

// GLM ASR API 配置
export const GLM_ASR = {
  ENDPOINT: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
  ENDPOINT_INTL: 'https://api.z.ai/api/paas/v4/audio/transcriptions',
  MODEL: 'glm-asr-2512',
  MAX_DURATION: 30, // 最大录音时长（秒）
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 最大文件大小（25MB）
} as const

// 默认快捷键配置（主进程有 process；渲染进程 bundle 时可能无 process，需避免顶层访问）
const isDarwin =
  typeof process !== 'undefined' &&
  typeof process.platform === 'string' &&
  process.platform === 'darwin'

export const DEFAULT_HOTKEYS = {
  PTT: isDarwin ? 'Alt' : 'Control+Shift+Space',
  FLASH_NOTE_START: isDarwin ? 'Command+Shift+9' : 'Control+Shift+9',
  FLASH_NOTE_END: isDarwin ? 'Command+Shift+0' : 'Control+Shift+0',
  SETTINGS: isDarwin ? 'Command+Shift+,' : 'Control+Shift+,',
} as const

// 录音配置
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  ENCODING: 'signed-integer',
  BIT_DEPTH: 16,
} as const

/** 默认采集：与设置页出厂一致——单声道 + 24kbps；回声/降噪/AGC 均默认关；约束失败时回退开启 */
export const DEFAULT_AUDIO_CAPTURE_PREFERENCES: AudioCapturePreferences = {
  opusBitsPerSecond: 24_000,
  preferMono: true,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  fallbackOnMicConstraintFailure: true,
}

/** 设置页下拉可选码率（bps） */
export const AUDIO_CAPTURE_OPUS_BITRATE_OPTIONS = [16000, 24000, 32000, 48000, 64000] as const

export const AUDIO_CAPTURE_OPUS_BITRATE_MIN = 6000
export const AUDIO_CAPTURE_OPUS_BITRATE_MAX = 128000

/** 闪记分片策略：固定 4 分钟，单片硬上限 5 分钟 */
export const FLASH_NOTE = {
  CHUNK_DURATION_SEC: 240,
  CHUNK_MAX_DURATION_SEC: 300,
} as const

/** ERPNextCN DTY 音频归档上传（与 ASR 并行，失败不影响主流程） */
export const ERPNEXTCN_DTY = {
  DEFAULT_HOST: 'https://endty-api.datangyuan.cn',
  UPLOAD_PATH: '/oss/upload-oss-file',
} as const

/** 阿里云 DashScope（千问短音频同步 ASR：multimodal-generation） */
export const DASHSCOPE = {
  BASE_CN: 'https://dashscope.aliyuncs.com',
  BASE_INTL: 'https://dashscope-intl.aliyuncs.com',
  BASE_US: 'https://dashscope-us.aliyuncs.com',
  MULTIMODAL_GENERATION_PATH: '/api/v1/services/aigc/multimodal-generation/generation',
  /** 纯文本对话 / 文本生成（与 multimodal-generation 不同路径；部分新模型需用下方 compatible-mode） */
  TEXT_GENERATION_PATH: '/api/v1/services/aigc/text-generation/generation',
  /** OpenAI 兼容 Chat Completions（与旧版 text-generation 二选一） */
  COMPATIBLE_CHAT_COMPLETIONS_PATH: '/compatible-mode/v1/chat/completions',
  /**
   * 闪记总结等默认模型：与官方 `text-generation/generation` 示例一致（qwen-plus）；
   * 若使用 compatible-mode 可改为 qwen3.5-flash 等（见百炼模型列表）。
   */
  TEXT_LLM_DEFAULT_MODEL: 'qwen-plus',
  /** 与控制台常见配置一致；非流式调用需配合 enable_thinking: false */
  TEXT_LLM_DEFAULT_TEMPERATURE: 0.7,
  TEXT_LLM_DEFAULT_TOP_P: 0.8,
  QWEN_ASR_SHORT_MODEL_CN_INTL: 'qwen3-asr-flash',
  /** 与 QWEN_ASR_SHORT_MODEL_CN_INTL 同接口，较新快照版本 */
  QWEN_ASR_SHORT_MODEL_CN_INTL_20260210: 'qwen3-asr-flash-2026-02-10',
  QWEN_ASR_SHORT_MODEL_US: 'qwen3-asr-flash-us',
  /** 千问短音频官方限制 */
  QWEN_SHORT_MAX_FILE_BYTES: 10 * 1024 * 1024,
} as const

export type QwenDashScopeRegion = 'cn' | 'intl' | 'us'

export function qwenDashScopeBase(region: QwenDashScopeRegion | undefined): string {
  const r = region ?? 'cn'
  if (r === 'us') return DASHSCOPE.BASE_US
  if (r === 'intl') return DASHSCOPE.BASE_INTL
  return DASHSCOPE.BASE_CN
}

export function qwenShortAsrModelName(
  region: QwenDashScopeRegion | undefined,
  cnIntlFlashModel?: QwenCnIntlFlashModelId | undefined,
): string {
  if ((region ?? 'cn') === 'us') {
    return DASHSCOPE.QWEN_ASR_SHORT_MODEL_US
  }
  if (cnIntlFlashModel === 'qwen3-asr-flash-2026-02-10') {
    return DASHSCOPE.QWEN_ASR_SHORT_MODEL_CN_INTL_20260210
  }
  return DASHSCOPE.QWEN_ASR_SHORT_MODEL_CN_INTL
}

export function qwenMultimodalGenerationUrl(region: QwenDashScopeRegion | undefined): string {
  return `${qwenDashScopeBase(region)}${DASHSCOPE.MULTIMODAL_GENERATION_PATH}`
}

export function qwenTextGenerationUrl(region: QwenDashScopeRegion | undefined): string {
  return `${qwenDashScopeBase(region)}${DASHSCOPE.TEXT_GENERATION_PATH}`
}

/** 百炼 OpenAI 兼容接口（默认文本 LLM 摘要等；地域需与 API Key 一致） */
export function qwenCompatibleChatCompletionsUrl(region: QwenDashScopeRegion | undefined): string {
  return `${qwenDashScopeBase(region)}${DASHSCOPE.COMPATIBLE_CHAT_COMPLETIONS_PATH}`
}

/** 天翼云 Wishub 推理服务（OpenAI 兼容 chat/completions） */
export const CTYUN = {
  WISHUB_BASE: {
    x1: 'https://wishub-x1.ctyun.cn',
    x5: 'https://wishub-x5.ctyun.cn',
    x6: 'https://wishub-x6.ctyun.cn',
  },
  CHAT_COMPLETIONS_PATH: '/v1/chat/completions',
  DEFAULT_REGION: 'x1' as const,
} as const

export type CtyunWishubRegion = keyof typeof CTYUN.WISHUB_BASE

export function ctyunChatCompletionsUrl(region: CtyunWishubRegion | undefined): string {
  const r = region ?? CTYUN.DEFAULT_REGION
  const base = CTYUN.WISHUB_BASE[r in CTYUN.WISHUB_BASE ? r : CTYUN.DEFAULT_REGION]
  return `${base}${CTYUN.CHAT_COMPLETIONS_PATH}`
}

export function normalizeTextLlmProvider(raw: unknown): TextLlmProvider {
  return raw === 'ctyun' ? 'ctyun' : 'aliyun'
}

export function normalizeTextLlmRegion(raw: unknown, provider: TextLlmProvider): TextLlmRegion {
  if (provider === 'ctyun') {
    if (raw === 'x5' || raw === 'x6') return raw
    return CTYUN.DEFAULT_REGION
  }
  if (raw === 'intl' || raw === 'us') return raw
  return 'cn'
}

export function textLlmDefaultGenerationUrl(
  provider: TextLlmProvider,
  region: TextLlmRegion,
): string {
  if (provider === 'ctyun') {
    const r = region === 'x5' || region === 'x6' ? region : CTYUN.DEFAULT_REGION
    return ctyunChatCompletionsUrl(r)
  }
  const r = region === 'intl' || region === 'us' ? region : 'cn'
  return qwenCompatibleChatCompletionsUrl(r)
}
