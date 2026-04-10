import axios from 'axios'
import type {
  ASRConfig,
  DiagnosticItem,
  DiagnosticsRunResult,
  ErpnextcnDtyConfig,
  TextLlmConfig,
} from '../shared/types'
import { DASHSCOPE, GLM_ASR } from '../shared/constants'
import { probeTextLlmConnection } from './dashscope-text-generation'
import { probeQwenDashScopeAsr } from './qwen-asr-provider'

function normalizeArchiveHost(host: string): string {
  const t = host.trim().replace(/\/$/, '')
  if (!t) return ''
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  return `https://${t}`
}

async function diagnoseNetwork(): Promise<DiagnosticItem> {
  try {
    await axios.get(DASHSCOPE.BASE_CN, {
      timeout: 6000,
      validateStatus: () => true,
      maxRedirects: 5,
    })
    return { id: 'network', status: 'ok', messageKey: 'diagnostics.network.ok' }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return { id: 'network', status: 'fail', messageKey: 'diagnostics.network.timeout' }
      }
      return { id: 'network', status: 'fail', messageKey: 'diagnostics.network.unreachable' }
    }
    return {
      id: 'network',
      status: 'fail',
      messageKey: 'diagnostics.network.unknown',
      messageParams: { detail: String(err) },
    }
  }
}

async function diagnoseGlmAsr(config: ASRConfig): Promise<DiagnosticItem> {
  const region = config.region || 'cn'
  const apiKey = config.apiKeys[region]?.trim()
  if (!apiKey) {
    return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.noKeyGlm' }
  }
  const endpoint =
    config.endpoint?.trim() || (region === 'intl' ? GLM_ASR.ENDPOINT_INTL : GLM_ASR.ENDPOINT)

  try {
    const res = await axios.post(
      endpoint,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
        validateStatus: () => true,
      },
    )
    if (res.status === 401 || res.status === 403) {
      return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.auth' }
    }
    if (res.status === 400 || res.status === 422) {
      return { id: 'asr', status: 'ok', messageKey: 'diagnostics.asr.ok' }
    }
    if (res.status >= 200 && res.status < 300) {
      return { id: 'asr', status: 'ok', messageKey: 'diagnostics.asr.ok' }
    }
    return {
      id: 'asr',
      status: 'fail',
      messageKey: 'diagnostics.asr.endpoint',
      messageParams: { detail: String(res.status) },
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.network' }
      }
      const st = err.response?.status
      if (st === 400 || st === 422) {
        return { id: 'asr', status: 'ok', messageKey: 'diagnostics.asr.ok' }
      }
      if (st === 401 || st === 403) {
        return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.auth' }
      }
      if (err.response) {
        return {
          id: 'asr',
          status: 'fail',
          messageKey: 'diagnostics.asr.endpoint',
          messageParams: { detail: String(st) },
        }
      }
      return {
        id: 'asr',
        status: 'fail',
        messageKey: 'diagnostics.asr.network',
        messageParams: { detail: err.message },
      }
    }
    return {
      id: 'asr',
      status: 'fail',
      messageKey: 'diagnostics.asr.unknown',
      messageParams: { detail: String(err) },
    }
  }
}

function mapQwenAsrProbe(r: Awaited<ReturnType<typeof probeQwenDashScopeAsr>>): DiagnosticItem {
  if (r.ok) return { id: 'asr', status: 'ok', messageKey: 'diagnostics.asr.ok' }
  if (r.code === 'no_key') {
    return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.noKeyQwen' }
  }
  if (r.code === 'auth') return { id: 'asr', status: 'fail', messageKey: 'diagnostics.asr.auth' }
  if (r.code === 'network') {
    return {
      id: 'asr',
      status: 'fail',
      messageKey: 'diagnostics.asr.network',
      messageParams: r.detail ? { detail: r.detail } : undefined,
    }
  }
  if (r.code === 'endpoint') {
    return {
      id: 'asr',
      status: 'fail',
      messageKey: 'diagnostics.asr.endpoint',
      messageParams: r.detail ? { detail: r.detail } : undefined,
    }
  }
  return {
    id: 'asr',
    status: 'fail',
    messageKey: 'diagnostics.asr.unknown',
    messageParams: r.detail ? { detail: r.detail } : { detail: 'unknown' },
  }
}

function mapTextLlmProbe(r: Awaited<ReturnType<typeof probeTextLlmConnection>>): DiagnosticItem {
  if (r.ok) return { id: 'textLlm', status: 'ok', messageKey: 'diagnostics.textLlm.ok' }
  if (r.code === 'no_key') {
    return { id: 'textLlm', status: 'fail', messageKey: 'diagnostics.textLlm.noKey' }
  }
  if (r.code === 'auth') {
    return { id: 'textLlm', status: 'fail', messageKey: 'diagnostics.textLlm.auth' }
  }
  if (r.code === 'network') {
    return {
      id: 'textLlm',
      status: 'fail',
      messageKey: 'diagnostics.textLlm.network',
      messageParams: r.detail ? { detail: r.detail } : undefined,
    }
  }
  if (r.code === 'endpoint') {
    return {
      id: 'textLlm',
      status: 'fail',
      messageKey: 'diagnostics.textLlm.endpoint',
      messageParams: r.detail ? { detail: r.detail } : undefined,
    }
  }
  return {
    id: 'textLlm',
    status: 'fail',
    messageKey: 'diagnostics.textLlm.unknown',
    messageParams: r.detail ? { detail: r.detail } : { detail: 'unknown' },
  }
}

async function diagnoseErpnext(dty: ErpnextcnDtyConfig): Promise<DiagnosticItem> {
  const hostRaw = dty.host?.trim()
  if (!hostRaw) {
    return { id: 'erpnextUpload', status: 'skip', messageKey: 'diagnostics.erpnext.skip' }
  }
  const base = normalizeArchiveHost(hostRaw)
  if (!dty.apiKey?.trim()) {
    return { id: 'erpnextUpload', status: 'fail', messageKey: 'diagnostics.erpnext.noKey' }
  }

  try {
    await axios.get(base, {
      timeout: 8000,
      validateStatus: () => true,
      maxRedirects: 3,
    })
    return { id: 'erpnextUpload', status: 'ok', messageKey: 'diagnostics.erpnext.ok' }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        return {
          id: 'erpnextUpload',
          status: 'fail',
          messageKey: 'diagnostics.erpnext.unreachable',
        }
      }
      if (err.response) {
        return { id: 'erpnextUpload', status: 'ok', messageKey: 'diagnostics.erpnext.ok' }
      }
      return { id: 'erpnextUpload', status: 'fail', messageKey: 'diagnostics.erpnext.unreachable' }
    }
    return {
      id: 'erpnextUpload',
      status: 'fail',
      messageKey: 'diagnostics.erpnext.unknown',
      messageParams: { detail: String(err) },
    }
  }
}

export async function runMainProcessDiagnostics(
  asr: ASRConfig,
  textLlm: TextLlmConfig,
  erpnext: ErpnextcnDtyConfig,
): Promise<DiagnosticsRunResult> {
  const items: DiagnosticItem[] = []

  items.push(await diagnoseNetwork())

  if (asr.provider === 'qwen') {
    items.push(mapQwenAsrProbe(await probeQwenDashScopeAsr(asr)))
  } else {
    items.push(await diagnoseGlmAsr(asr))
  }

  items.push(mapTextLlmProbe(await probeTextLlmConnection(textLlm)))
  items.push(await diagnoseErpnext(erpnext))

  return {
    ranAt: new Date().toISOString(),
    items,
  }
}
