// 共享常量

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

/** ERPNextCN DTY 音频归档上传（与 ASR 并行，失败不影响主流程） */
export const ERPNEXTCN_DTY = {
  DEFAULT_HOST: 'https://endty-api.datangyuan.cn',
  UPLOAD_PATH: '/oss/upload-oss-file',
} as const

/** 阿里云 DashScope（千问异步 ASR） */
export const DASHSCOPE = {
  BASE_CN: 'https://dashscope.aliyuncs.com',
  BASE_INTL: 'https://dashscope-intl.aliyuncs.com',
  /** 与官方示例一致 */
  QWEN_ASR_MODEL: 'qwen3-asr-flash-filetrans',
} as const
