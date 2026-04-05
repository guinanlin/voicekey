import axios from 'axios'
import { qwenMultimodalGenerationUrl, qwenShortAsrModelName } from '../shared/constants'
import type { ASRConfig } from '../shared/types'
import type { TranscriptionResult } from './asr-provider'

const SYNC_REQUEST_TIMEOUT_MS = 120_000

function getOutput(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null
  const out = (data as Record<string, unknown>).output
  if (!out || typeof out !== 'object') return null
  return out as Record<string, unknown>
}

function formatDashScopeHttpError(status: number, data: unknown): string {
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

/** 解析千问3-ASR-Flash 同步接口 `output.choices[0].message.content` 中的文本片段 */
function textFromMultimodalOutput(data: unknown): string {
  const out = getOutput(data)
  if (!out) return ''
  const choices = out.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''
  const first = choices[0]
  if (!first || typeof first !== 'object') return ''
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
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
 * DashScope 同步多模态：公网音频 URL → 转写文本（千问短音频 qwen3-asr-flash / qwen3-asr-flash-us）。
 */
export async function transcribeQwenFromFileUrl(
  config: ASRConfig,
  fileUrl: string,
): Promise<TranscriptionResult> {
  const apiKey = config.qwenApiKey?.trim()
  if (!apiKey) {
    throw new Error('Qwen ASR: API key is empty')
  }

  const url = qwenMultimodalGenerationUrl(config.qwenRegion)
  const model = qwenShortAsrModelName(config.qwenRegion)

  const asrOptions: Record<string, unknown> = {
    enable_itn: false,
  }
  const lang = config.language?.trim()
  if (lang && lang !== 'auto') {
    asrOptions.language = lang
  }

  const body = {
    model,
    input: {
      messages: [
        {
          role: 'user' as const,
          content: [{ audio: fileUrl }],
        },
      ],
    },
    parameters: {
      asr_options: asrOptions,
    },
  }

  try {
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: SYNC_REQUEST_TIMEOUT_MS,
      validateStatus: (s) => s === 200,
    })

    const text = textFromMultimodalOutput(res.data)
    const requestId =
      typeof res.data === 'object' &&
      res.data !== null &&
      typeof (res.data as { request_id?: unknown }).request_id === 'string'
        ? (res.data as { request_id: string }).request_id
        : ''

    return {
      text,
      id: requestId,
      created: Date.now(),
      model,
    }
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const msg = formatDashScopeHttpError(err.response.status, err.response.data)
      throw new Error(`Qwen ASR: ${msg}`)
    }
    throw err
  }
}

/**
 * 探测 DashScope 同步接口是否可达且 Key 有效：故意省略必填字段，期望 400（非 401/403）。
 */
export async function testQwenDashScopeConnection(config: ASRConfig): Promise<boolean> {
  const apiKey = config.qwenApiKey?.trim()
  if (!apiKey) return false

  const url = qwenMultimodalGenerationUrl(config.qwenRegion)
  const model = qwenShortAsrModelName(config.qwenRegion)

  try {
    const res = await axios.post(
      url,
      { model },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15_000,
        validateStatus: () => true,
      },
    )
    if (res.status === 401 || res.status === 403) return false
    if (res.status === 400) return true
    if (res.status === 200) return true
    return false
  } catch {
    return false
  }
}
