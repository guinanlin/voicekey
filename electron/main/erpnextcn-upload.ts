import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'node:path'
import { ERPNEXTCN_DTY } from '../shared/constants'

export interface ErpnextcnDtyResolved {
  host: string
  apiKey: string
}

/**
 * 将 MP3 上传到 ERPNextCN DTY OSS 接口（与 Python upload_to_erpnextcn_dty 行为对齐）。
 * 调用方应对异常自行捕获；未配置 host/key 时直接跳过。
 */
export async function uploadErpnextcnDtyMp3(
  mp3Path: string,
  resolved: ErpnextcnDtyResolved,
): Promise<unknown | null> {
  const { host, apiKey } = resolved
  if (!host.trim() || !apiKey.trim()) {
    console.log('[ERPNextCN] Upload skipped: ERPNEXTCN_DTY host or API key not configured')
    return null
  }

  const base = host.replace(/\/$/, '')
  const uploadUrl = `${base}${ERPNEXTCN_DTY.UPLOAD_PATH}`
  const basename = path.basename(mp3Path)
  const objectName = `/uploads/${basename}`

  const form = new FormData()
  form.append('file', fs.createReadStream(mp3Path), {
    filename: basename,
    contentType: 'audio/mpeg',
  })

  const uploadStart = Date.now()
  console.log(`[ERPNextCN] Uploading ${basename}...`)

  try {
    const response = await axios.post(uploadUrl, form, {
      headers: {
        ...form.getHeaders(),
        accept: 'application/json',
        'X-API-Key': apiKey,
      },
      params: { object_name: objectName },
      timeout: 120_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (s) => s === 200,
    })

    const uploadMs = Date.now() - uploadStart
    console.log(`[ERPNextCN] Upload OK in ${uploadMs}ms`, response.data)
    return response.data
  } catch (err) {
    const uploadMs = Date.now() - uploadStart
    if (axios.isAxiosError(err)) {
      const detail = err.response?.data ?? err.message
      console.error(`[ERPNextCN] Upload failed after ${uploadMs}ms:`, detail)
    } else {
      console.error(`[ERPNextCN] Upload failed after ${uploadMs}ms:`, err)
    }
    throw err
  }
}

/**
 * 从 ERPNextCN 上传成功响应拼出公网 HTTPS URL，供 DashScope `file_url` 使用。
 * 期望字段：`domain`（如 https://xxx.cos...）、`object_name`（如 /uploads/xxx.mp3）。
 */
export function fileUrlFromErpnextUploadResponse(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    console.warn('[ERPNextCN] file_url: response is not an object')
    return null
  }
  const d = data as Record<string, unknown>
  const domain = typeof d.domain === 'string' ? d.domain.trim().replace(/\/$/, '') : ''
  const objectName = typeof d.object_name === 'string' ? d.object_name.trim() : ''
  if (!domain || !objectName) {
    console.warn('[ERPNextCN] file_url: missing domain or object_name', data)
    return null
  }
  const path = objectName.startsWith('/') ? objectName : `/${objectName}`
  try {
    const u = new URL(path, domain.endsWith('/') ? domain : `${domain}/`)
    return u.href
  } catch {
    const joined = `${domain}${path}`
    return joined.startsWith('https://') ? joined : null
  }
}
