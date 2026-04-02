import axios from 'axios'
import { DASHSCOPE } from '../shared/constants'
import type { ASRConfig } from '../shared/types'
import type { TranscriptionResult } from './asr-provider'

const POLL_INTERVAL_MS = 1_500
const POLL_TIMEOUT_MS = 120_000
const SUBMIT_TIMEOUT_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function dashscopeBase(region: ASRConfig['qwenRegion']): string {
  return region === 'intl' ? DASHSCOPE.BASE_INTL : DASHSCOPE.BASE_CN
}

function dashscopeAsyncHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  }
}

function extractTaskId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const out = (data as Record<string, unknown>).output
  if (!out || typeof out !== 'object') return null
  const o = out as Record<string, unknown>
  if (typeof o.task_id === 'string' && o.task_id.trim()) return o.task_id.trim()
  if (typeof o.taskId === 'string' && o.taskId.trim()) return o.taskId.trim()
  return null
}

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

function transcriptionUrlFromOutput(out: Record<string, unknown>): string | null {
  const result = out.result
  if (!result || typeof result !== 'object') return null
  const u = (result as Record<string, unknown>).transcription_url
  return typeof u === 'string' && u.trim() ? u.trim() : null
}

/** 解析 `transcription_url` 指向的 JSON（官方 transcripts[].text） */
function textFromTranscriptionResultJson(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as { transcripts?: unknown }
  if (!Array.isArray(d.transcripts)) return ''
  const parts: string[] = []
  for (const item of d.transcripts) {
    if (!item || typeof item !== 'object') continue
    const text = (item as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) parts.push(text.trim())
  }
  return parts.join('\n')
}

/**
 * 提交异步任务并轮询；成功后拉取 `transcription_url` 的 JSON 得到正文。
 */
export async function transcribeQwenFromFileUrl(
  config: ASRConfig,
  fileUrl: string,
): Promise<TranscriptionResult> {
  const apiKey = config.qwenApiKey?.trim()
  if (!apiKey) {
    throw new Error('Qwen ASR: API key is empty')
  }

  const base = dashscopeBase(config.qwenRegion)
  const submitUrl = `${base}/api/v1/services/audio/asr/transcription`
  const parameters: Record<string, unknown> = {
    channel_id: [0],
    enable_itn: false,
  }
  const lang = config.language?.trim()
  if (lang && lang !== 'auto') {
    parameters.language = lang
  }

  let taskId: string
  try {
    const submitRes = await axios.post(
      submitUrl,
      {
        model: DASHSCOPE.QWEN_ASR_MODEL,
        input: { file_url: fileUrl },
        parameters,
      },
      {
        headers: dashscopeAsyncHeaders(apiKey),
        timeout: SUBMIT_TIMEOUT_MS,
        validateStatus: (s) => s === 200,
      },
    )
    const id = extractTaskId(submitRes.data)
    if (!id) {
      console.error('[QwenASR] Submit response missing task_id:', submitRes.data)
      throw new Error('Qwen ASR: submit response missing task_id')
    }
    taskId = id
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const msg = formatDashScopeHttpError(err.response.status, err.response.data)
      throw new Error(`Qwen ASR: ${msg}`)
    }
    throw err
  }

  const pollUrl = `${base}/api/v1/tasks/${taskId}`
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    let pollRes
    try {
      pollRes = await axios.get(pollUrl, {
        headers: dashscopeAsyncHeaders(apiKey),
        timeout: SUBMIT_TIMEOUT_MS,
        validateStatus: (s) => s === 200,
      })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const msg = formatDashScopeHttpError(err.response.status, err.response.data)
        throw new Error(`Qwen ASR: ${msg}`)
      }
      throw err
    }

    const out = getOutput(pollRes.data)
    if (!out) {
      throw new Error('Qwen ASR: poll response missing output')
    }

    const taskStatus = typeof out.task_status === 'string' ? out.task_status : ''
    if (taskStatus === 'SUCCEEDED') {
      const tUrl = transcriptionUrlFromOutput(out)
      if (!tUrl) {
        console.error('[QwenASR] SUCCEEDED but no transcription_url:', pollRes.data)
        throw new Error('Qwen ASR: missing transcription_url')
      }
      const jsonRes = await axios.get(tUrl, {
        timeout: SUBMIT_TIMEOUT_MS,
        validateStatus: (s) => s === 200,
        responseType: 'json',
      })
      const text = textFromTranscriptionResultJson(jsonRes.data)
      return {
        text,
        id: taskId,
        created: Date.now(),
        model: DASHSCOPE.QWEN_ASR_MODEL,
      }
    }

    if (taskStatus === 'FAILED') {
      const msg =
        (typeof out.message === 'string' && out.message) ||
        (typeof out.code === 'string' && out.code) ||
        'FAILED'
      throw new Error(`Qwen ASR: ${msg}`)
    }

    if (taskStatus === 'UNKNOWN') {
      throw new Error('Qwen ASR: task UNKNOWN')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Qwen ASR: task polling timeout')
}

/**
 * 用不存在的 task id 探测鉴权：有效 Key 通常返回 200 且 `output.task_status` 为 `UNKNOWN`。
 */
export async function testQwenDashScopeConnection(config: ASRConfig): Promise<boolean> {
  const apiKey = config.qwenApiKey?.trim()
  if (!apiKey) return false

  const base = dashscopeBase(config.qwenRegion)
  const url = `${base}/api/v1/tasks/00000000-0000-0000-0000-000000000000`

  try {
    const res = await axios.get(url, {
      headers: dashscopeAsyncHeaders(apiKey),
      timeout: 15_000,
      validateStatus: () => true,
    })
    if (res.status === 401 || res.status === 403) return false
    const out = getOutput(res.data)
    return res.status === 200 && !!out && typeof out.task_status === 'string'
  } catch {
    return false
  }
}
