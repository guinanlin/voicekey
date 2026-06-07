import axios from 'axios'
import { DASHSCOPE, textLlmDefaultGenerationUrl } from '../shared/constants'
import type { TextLlmConfig, TextLlmProbeResult } from '../shared/types'

const REQUEST_TIMEOUT_MS = 120_000
const TEXT_LLM_PROBE_TIMEOUT_MS = 12_000

export type TextGenMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 用户显式配置旧版 text-generation 完整 URL 时走 legacy 请求体与解析 */
export function isLegacyDashScopeTextGenerationUrl(url: string): boolean {
  return url.includes('text-generation/generation')
}

function resolveTextLlmRequestUrl(config: TextLlmConfig): string {
  const custom = config.generationUrl?.trim()
  if (custom) return custom
  const provider = config.provider ?? 'aliyun'
  return textLlmDefaultGenerationUrl(provider, config.region)
}

function getOutput(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const out = (data as Record<string, unknown>).output
  if (!out || typeof out !== 'object') return null
  return out as Record<string, unknown>
}

function formatDashScopeHttpError(status: number, data: unknown): string {
  if (data && typeof data === 'object') {
    const root = data as Record<string, unknown>
    const detail = root.detail
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
    const errObj = root.error
    if (errObj && typeof errObj === 'object') {
      const em = (errObj as { message?: unknown }).message
      if (typeof em === 'string' && em.trim()) return em.trim()
    }
  }
  const out = getOutput(data)
  const msg =
    (out && typeof out.message === 'string' && out.message) ||
    (data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
      ? String((data as { message: string }).message)
      : null)
  const code = out && typeof out.code === 'string' ? out.code : null
  if (msg && code) return `${code}: ${msg}`
  if (msg) return msg
  return `HTTP ${status}`
}

/**
 * 解析 text-generation `output.choices[0].message.content`（string 或多段 `{ text }`）。
 * 导出供单元测试覆盖，避免网络调用。
 */
export function parseDashScopeTextGenerationOutput(data: unknown): string {
  const out = getOutput(data)
  if (!out) return ''
  const choices = out.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (!first || typeof first !== 'object') return ''
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const item of content) {
    if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
      const t = (item as { text: string }).text
      if (t.trim()) parts.push(t.trim())
    }
  }
  return parts.join('')
}

/**
 * 解析 OpenAI 兼容 `chat/completions`：`choices[0].message.content`（string 或 `{ type,text }[]`）。
 */
export function parseOpenAiCompatibleChatContent(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const choices = (data as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (!first || typeof first !== 'object') return ''
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const item of content) {
    if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
      const t = (item as { text: string }).text
      if (t.trim()) parts.push(t.trim())
    }
  }
  return parts.join('')
}

/**
 * DashScope 文本：默认 **OpenAI 兼容** `.../compatible-mode/v1/chat/completions`（与 qwen3.5-flash 等匹配）；
 * 若 `generationUrl` 指向 `.../text-generation/generation` 则使用旧版协议（须与纯文本模型如 qwen-plus 匹配，勿用 qwen3.5-flash）。
 */
export async function generateTextWithTextLlm(
  config: TextLlmConfig,
  messages: TextGenMessage[],
): Promise<string> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey) {
    throw new Error('Text LLM: API key is empty')
  }

  const url = resolveTextLlmRequestUrl(config)
  const model = config.model?.trim() || DASHSCOPE.TEXT_LLM_DEFAULT_MODEL
  const legacy =
    (config.provider ?? 'aliyun') === 'aliyun' && isLegacyDashScopeTextGenerationUrl(url)

  const temperature = DASHSCOPE.TEXT_LLM_DEFAULT_TEMPERATURE
  const topP = DASHSCOPE.TEXT_LLM_DEFAULT_TOP_P

  const body = legacy
    ? {
        model,
        input: { messages },
        parameters: {
          result_format: 'message' as const,
          temperature,
          top_p: topP,
          /** 关闭深度思考；非流式调用时混合思考模型也要求显式 false */
          enable_thinking: false,
        },
      }
    : {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        top_p: topP,
      }

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: (s) => s === 200,
    })

    const text = legacy
      ? parseDashScopeTextGenerationOutput(res.data)
      : parseOpenAiCompatibleChatContent(res.data)
    return text
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const msg = formatDashScopeHttpError(err.response.status, err.response.data)
      throw new Error(`Text LLM: ${msg}`)
    }
    throw err
  }
}

/**
 * 轻量探测 text LLM。
 * 阿里云：POST 仅含 model，400/200 表示端点与 Key 基本可用。
 * 天翼云：须带 messages（与官方 curl 一致），200 表示成功。
 */
export async function probeTextLlmConnection(config: TextLlmConfig): Promise<TextLlmProbeResult> {
  const apiKey = config.apiKey?.trim()
  if (!apiKey) return { ok: false, code: 'no_key' }

  const provider = config.provider ?? 'aliyun'
  const model = config.model?.trim()
  if (provider === 'ctyun' && !model) {
    return { ok: false, code: 'no_model' }
  }

  const url = resolveTextLlmRequestUrl(config)
  const resolvedModel = model || DASHSCOPE.TEXT_LLM_DEFAULT_MODEL
  const body =
    provider === 'ctyun'
      ? {
          model: resolvedModel,
          messages: [{ role: 'user' as const, content: 'ping' }],
          stream: false,
        }
      : { model: resolvedModel }

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      timeout: TEXT_LLM_PROBE_TIMEOUT_MS,
      validateStatus: () => true,
    })
    if (res.status === 401 || res.status === 403) return { ok: false, code: 'auth' }
    if (res.status === 200) return { ok: true, code: 'ok' }
    if (provider === 'aliyun' && res.status === 400) return { ok: true, code: 'ok' }
    const msg = formatDashScopeHttpError(res.status, res.data)
    return { ok: false, code: 'endpoint', detail: msg }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') return { ok: false, code: 'network' }
      if (err.response?.status === 200) return { ok: true, code: 'ok' }
      if (provider === 'aliyun' && err.response?.status === 400) {
        return { ok: true, code: 'ok' }
      }
      if (err.response?.status === 401 || err.response?.status === 403) {
        return { ok: false, code: 'auth' }
      }
      if (err.response) {
        const msg = formatDashScopeHttpError(err.response.status, err.response.data)
        return { ok: false, code: 'endpoint', detail: msg }
      }
      return { ok: false, code: 'network', detail: err.message }
    }
    return { ok: false, code: 'unknown', detail: String(err) }
  }
}
