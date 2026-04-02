import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { GLM_ASR } from '../shared/constants'
import { ASRConfig } from '../shared/types'

export interface TranscriptionResult {
  text: string
  id: string
  created: number
  model: string
}

export interface TranscriptionError {
  code: string
  message: string
}

/** `message.content` 可能是 string，或 multimodal 数组（如 `{ type, text }[]`） */
function normalizeAssistantContent(content: unknown): string | null {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const part of content) {
      if (typeof part === 'string') {
        parts.push(part)
      } else if (part && typeof part === 'object' && 'text' in part) {
        const t = (part as { text?: unknown }).text
        if (typeof t === 'string') {
          parts.push(t)
        }
      }
    }
    return parts.length > 0 ? parts.join('') : null
  }
  return null
}

/**
 * 智谱 ASR 可能返回：
 * - 旧式：`{ text, id, created, model }`
 * - 新式（类 Chat Completion）：`{ choices: [{ message: { content } }], id, model, ... }`
 */
function extractTranscriptionPayload(data: unknown): {
  text: string
  id: string
  created: number
  model: string
} | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  const d = data as Record<string, unknown>

  if (d.error) {
    const errObj = d.error as { message?: string; code?: string }
    throw new Error(`ASR Error: ${errObj.message || errObj.code || JSON.stringify(d.error)}`)
  }

  if (typeof d.text === 'string') {
    return {
      text: d.text,
      id: typeof d.id === 'string' ? d.id : '',
      created: typeof d.created === 'number' ? d.created : Date.now(),
      model: typeof d.model === 'string' ? d.model : GLM_ASR.MODEL,
    }
  }

  const choices = d.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as { message?: { content?: unknown } }
    const content = first?.message?.content
    const text = normalizeAssistantContent(content)
    if (text !== null) {
      return {
        text,
        id: typeof d.id === 'string' ? d.id : '',
        created: typeof d.created === 'number' ? d.created : Date.now(),
        model: typeof d.model === 'string' ? d.model : GLM_ASR.MODEL,
      }
    }
  }

  return null
}

export class ASRProvider {
  private config: ASRConfig

  constructor(config: ASRConfig) {
    this.config = config
  }

  // 更新配置
  updateConfig(config: ASRConfig): void {
    this.config = config
  }

  // 转录音频文件
  async transcribe(audioFilePath: string): Promise<TranscriptionResult> {
    const transcribeStartTime = Date.now()

    // Determine Region and API Key
    const region = this.config.region || 'cn'
    const apiKey = this.config.apiKeys[region]

    if (!apiKey) {
      throw new Error(`API Key not configured for region: ${region}`)
    }

    // Determine Endpoint
    // Use user-configured endpoint if available, otherwise use default for the region
    let endpoint = this.config.endpoint
    if (!endpoint) {
      endpoint = region === 'intl' ? GLM_ASR.ENDPOINT_INTL : GLM_ASR.ENDPOINT
    }

    if (!fs.existsSync(audioFilePath)) {
      throw new Error('Audio file not found')
    }

    try {
      const formDataStartTime = Date.now()
      const formData = new FormData()
      formData.append('file', fs.createReadStream(audioFilePath))
      formData.append('model', GLM_ASR.MODEL)
      formData.append('stream', 'false')

      if (this.config.language) {
        formData.append('language', this.config.language)
      }
      const formDataDuration = Date.now() - formDataStartTime
      console.log(`[ASR] ⏱️  FormData preparation took ${formDataDuration}ms`)

      const requestStartTime = Date.now()
      console.log(
        `[ASR] [${new Date().toISOString()}] Sending POST request to ASR API (${region})...`,
      )
      console.log(`[ASR] Endpoint: ${endpoint}`)

      const response = await axios.post(endpoint, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000,
        responseType: 'json',
        responseEncoding: 'utf8',
      })
      const requestDuration = Date.now() - requestStartTime
      console.log(`[ASR] [${new Date().toISOString()}] API response received`)
      console.log(`[ASR] ⏱️  API network request took ${requestDuration}ms`)

      const payload = extractTranscriptionPayload(response.data)
      if (!payload) {
        const preview =
          typeof response.data === 'object' && response.data !== null
            ? JSON.stringify(response.data).slice(0, 2000)
            : String(response.data)
        console.error(
          '[ASR] Unexpected response shape (no text / choices[0].message.content):',
          preview,
        )
        throw new Error('Invalid response from ASR service')
      }

      const receivedText = payload.text
      console.log('[ASR] Raw response text:', receivedText)
      console.log('[ASR] Text length:', receivedText.length)
      console.log('[ASR] Text bytes:', Buffer.from(receivedText, 'utf8').toString('hex'))

      const totalDuration = Date.now() - transcribeStartTime
      console.log(`[ASR] ⏱️  Total transcribe() call took ${totalDuration}ms`)

      return {
        text: receivedText,
        id: payload.id,
        created: payload.created,
        model: payload.model,
      }
    } catch (error: unknown) {
      const errorDuration = Date.now() - transcribeStartTime
      console.error(`[ASR] Transcription failed after ${errorDuration}ms`)
      if (axios.isAxiosError(error)) {
        const errorData = error.response?.data?.error
        if (errorData) {
          throw new Error(`ASR Error: ${errorData.message || errorData.code || 'Unknown error'}`)
        }
        throw new Error(`Network Error: ${error.message}`)
      }
      throw error
    }
  }

  // 测试API连接
  async testConnection(): Promise<boolean> {
    try {
      const region = this.config.region || 'cn'
      const apiKey = this.config.apiKeys[region]

      if (!apiKey) {
        throw new Error('No API Key provided for selected region')
      }

      let endpoint = this.config.endpoint
      if (!endpoint) {
        endpoint = region === 'intl' ? GLM_ASR.ENDPOINT_INTL : GLM_ASR.ENDPOINT
      }

      // 创建一个简单的测试请求
      // 由于GLM ASR需要音频文件，这里只做一个简单的端点检查
      // 使用 POST 请求，因为 api.z.ai 可能不支持 HEAD
      // 即使没有文件，如果 API Key 正确，服务端通常会返回 400 (Bad Request)
      // 如果 Key 错误，则返回 401 (Unauthorized)
      try {
        await axios.post(
          endpoint,
          {},
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            timeout: 5000,
          },
        )
        return true
      } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
          // 400 意味着缺少参数（文件），但连接和认证通常通过了（或者至少连接通过了）
          // 严谨一点，401 肯定是 Key 错
          if (error.response.status === 400) {
            return true
          }
        }
        throw error
      }
      return true
    } catch (error) {
      console.error('Connection test failed:', error)
      return false
    }
  }
}
