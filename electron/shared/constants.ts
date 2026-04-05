// 共享常量

import type { AudioCapturePreferences } from './types'

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
  SETTINGS: isDarwin ? 'Command+Shift+,' : 'Control+Shift+,',
} as const

// 录音配置
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  ENCODING: 'signed-integer',
  BIT_DEPTH: 16,
} as const

/** 设置页与主进程合并用的默认采集策略（推荐：单声道 + 24kbps + 处理链 + 失败回退） */
export const DEFAULT_AUDIO_CAPTURE_PREFERENCES: AudioCapturePreferences = {
  opusBitsPerSecond: 24_000,
  preferMono: true,
  echoCancellation: true,
  noiseSuppression: true,
  fallbackOnMicConstraintFailure: true,
}

/** 设置页下拉可选码率（bps） */
export const AUDIO_CAPTURE_OPUS_BITRATE_OPTIONS = [16000, 24000, 32000, 48000, 64000] as const

export const AUDIO_CAPTURE_OPUS_BITRATE_MIN = 6000
export const AUDIO_CAPTURE_OPUS_BITRATE_MAX = 128000

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
  QWEN_ASR_SHORT_MODEL_CN_INTL: 'qwen3-asr-flash',
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

export function qwenShortAsrModelName(region: QwenDashScopeRegion | undefined): string {
  return (region ?? 'cn') === 'us'
    ? DASHSCOPE.QWEN_ASR_SHORT_MODEL_US
    : DASHSCOPE.QWEN_ASR_SHORT_MODEL_CN_INTL
}

export function qwenMultimodalGenerationUrl(region: QwenDashScopeRegion | undefined): string {
  return `${qwenDashScopeBase(region)}${DASHSCOPE.MULTIMODAL_GENERATION_PATH}`
}
