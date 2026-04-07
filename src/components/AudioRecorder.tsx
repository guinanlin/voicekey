import { useEffect, useRef } from 'react'
import {
  AUDIO_CAPTURE_OPUS_BITRATE_MAX,
  AUDIO_CAPTURE_OPUS_BITRATE_MIN,
  DEFAULT_AUDIO_CAPTURE_PREFERENCES,
} from '@electron/shared/constants'
import type { AudioCapturePreferences, SessionCaptureMode } from '@electron/shared/types'

function clampOpusBitrate(bps: number): number {
  return Math.min(
    AUDIO_CAPTURE_OPUS_BITRATE_MAX,
    Math.max(AUDIO_CAPTURE_OPUS_BITRATE_MIN, Math.round(bps)),
  )
}

function createMediaRecorder(
  stream: MediaStream,
  mimeType: string,
  opusBitsPerSecond: number,
): MediaRecorder {
  const bits = clampOpusBitrate(opusBitsPerSecond)
  const withMime = mimeType ? { mimeType } : {}
  try {
    return new MediaRecorder(stream, {
      ...withMime,
      audioBitsPerSecond: bits,
    })
  } catch {
    return new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  }
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

/**
 * 按设置申请麦克风流。务必显式传 echo/noise/autoGain：仅用 `{ audio: true }` 时 Chromium 仍常默认开回声消除，
 * 会把收音机/扬声器等环境声当回声削掉；与系统录音机行为不一致。
 */
async function acquireMicFromPrefs(ac: AudioCapturePreferences): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    ...(ac.preferMono ? { channelCount: { ideal: 1 } } : {}),
    /**
     * 使用 ideal 软约束而非硬布尔值，避免设备/驱动不完全支持时直接失败。
     * 这样更接近旧版本的稳定性（旧版接近 audio:true），同时尽量尊重设置偏好。
     */
    echoCancellation: { ideal: ac.echoCancellation },
    noiseSuppression: { ideal: ac.noiseSuppression },
    /** AGC 独立可配：在关闭回声/降噪时仍可开启以提升远场与外放可收录性 */
    autoGainControl: { ideal: ac.autoGainControl },
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio })
  } catch (e) {
    if (ac.fallbackOnMicConstraintFailure) {
      // eslint-disable-next-line no-console -- constraint fallback
      console.warn(
        '[Renderer] getUserMedia with explicit constraints failed, fallback audio:true',
        e,
      )
      return navigator.mediaDevices.getUserMedia({ audio: true })
    }
    throw e
  }
}

/**
 * 无头录音：
 * - **PTT / 闪记**（新开流时）：均走 `acquireMicFromPrefs`（`ideal` 软约束 + 可选回退），与设置页一致。
 *   曾对 PTT 单独使用 `{ audio: true }` 以抬升成功率，但 Chromium 会对「宽松约束」套用默认回声/降噪/AGC，
 *   与用户关闭上述项、依赖 AGC 等偏好冲突，表现为必须贴麦才能录清；故与闪记统一采集策略。
 * - **闪记**分片间复用同一麦克风流（仅重建 `MediaRecorder`）。
 */
export function AudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** 最近一次 SESSION_START 的场景（闪记分片复用时沿用已打开的流，不依赖本值） */
  const lastCaptureModeRef = useRef<SessionCaptureMode>('ptt')
  const chunksRef = useRef<Blob[]>([])
  const isRecordingRef = useRef(false)

  const audioConfigRef = useRef<AudioCapturePreferences>(DEFAULT_AUDIO_CAPTURE_PREFERENCES)
  const mimeTypeRef = useRef('')

  const streamReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelStreamRelease = (): void => {
    if (streamReleaseTimerRef.current) {
      clearTimeout(streamReleaseTimerRef.current)
      streamReleaseTimerRef.current = null
    }
  }

  const releaseResources = (): void => {
    cancelStreamRelease()
    isRecordingRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    mimeTypeRef.current = ''
  }

  const scheduleStreamRelease = (): void => {
    cancelStreamRelease()
    streamReleaseTimerRef.current = setTimeout(() => {
      streamReleaseTimerRef.current = null
      // eslint-disable-next-line no-console -- debug idle release
      console.log('[Renderer] Stream idle timeout — releasing resources')
      releaseResources()
    }, 2000)
  }

  const isStreamAlive = (): boolean =>
    !!streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === 'live')

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const unsubStart = api.onStartRecording(async (payload) => {
      const mode: SessionCaptureMode = payload?.captureMode ?? 'ptt'
      lastCaptureModeRef.current = mode

      if (isRecordingRef.current) {
        // eslint-disable-next-line no-console -- guard
        console.warn('[Renderer] Already recording, ignoring start request')
        return
      }

      try {
        cancelStreamRelease()
        isRecordingRef.current = true

        let inputStream: MediaStream
        let reused = false

        if (isStreamAlive()) {
          const s = streamRef.current
          if (!s) {
            isRecordingRef.current = false
            return
          }
          inputStream = s
          reused = true
          // eslint-disable-next-line no-console -- debug reuse
          console.log('[Renderer] Reusing existing mic stream for next chunk')
        } else {
          releaseResources()
          isRecordingRef.current = true

          const fullConfig = await api.getConfig()
          const ac: AudioCapturePreferences = {
            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
            ...(fullConfig.app.audioCapture ?? {}),
          }
          audioConfigRef.current = ac
          mimeTypeRef.current = pickMimeType()

          const base = await acquireMicFromPrefs(ac)
          streamRef.current = base
          inputStream = base
        }

        inputStream.getTracks().forEach((t) => {
          // eslint-disable-next-line no-console -- diagnostic
          console.log(
            `[Renderer] Recorder track: kind=${t.kind} enabled=${t.enabled} muted=${t.muted} readyState=${t.readyState}`,
          )
        })

        const mimeType = mimeTypeRef.current
        const mediaRecorder = createMediaRecorder(
          inputStream,
          mimeType,
          audioConfigRef.current.opusBitsPerSecond,
        )
        mediaRecorderRef.current = mediaRecorder
        chunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        const TIMESLICE_MS = 250

        mediaRecorder.onstop = async () => {
          const chunks = chunksRef.current
          const blob = new Blob(chunks, {
            type: mimeType || mediaRecorder.mimeType || 'audio/webm',
          })
          const buffer = await blob.arrayBuffer()

          mediaRecorderRef.current = null
          chunksRef.current = []
          isRecordingRef.current = false

          api.sendAudioData(buffer)
          // eslint-disable-next-line no-console -- diagnostic
          console.log(
            `[Renderer] Recording stopped — chunks: ${chunks.length}, buffer bytes: ${buffer.byteLength}`,
          )

          scheduleStreamRelease()
        }

        mediaRecorder.onerror = (e) => {
          // eslint-disable-next-line no-console -- recorder error
          console.error('[Renderer] MediaRecorder error:', e)
          api.sendError(`MediaRecorder error: ${e}`)
          releaseResources()
        }

        // eslint-disable-next-line no-console -- debug
        console.log(
          `[Renderer] Recording started (reuse=${reused}, mode=${lastCaptureModeRef.current})`,
        )
        mediaRecorder.start(TIMESLICE_MS)
      } catch (err) {
        // eslint-disable-next-line no-console -- mic failure
        console.error('[Renderer] Failed to start recording:', err)
        api.sendError(`Failed to access microphone: ${err}`)
        releaseResources()
      }
    })

    const unsubStop = api.onStopRecording(() => {
      // eslint-disable-next-line no-console -- debug
      console.log('[Renderer] onStopRecording triggered')
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        const mr = mediaRecorderRef.current
        try {
          mr.requestData()
        } catch {
          // 部分环境不支持 requestData
        }
        setTimeout(() => {
          if (mr.state === 'recording') mr.stop()
        }, 50)
      } else {
        releaseResources()
      }
    })

    return () => {
      unsubStart()
      unsubStop()
      releaseResources()
      // eslint-disable-next-line no-console -- debug
      console.log('[Renderer] AudioRecorder effect disposed')
    }
  }, [])

  return null
}
