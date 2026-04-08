import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLocale } from '@electron/shared/i18n'
import { Download, Play, ScrollText, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { FlashChunk, FlashSessionWithChunks } from '@electron/shared/types'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 开始时间等：`YYYY-MM-DD HH:mm`（中文常用横杠日期） */
function formatToMinute(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 实时时钟：`YYYY-MM-DD HH:mm:ss` */
function formatLiveClock(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatHm(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':')
}

function formatSelectOptionLabel(id: string, startedAt: number): string {
  return `${id} · ${formatToMinute(startedAt)}`
}

export default function SketchesPage() {
  const { t, i18n } = useTranslation()
  const locale = getLocale(i18n.language)
  const [sessions, setSessions] = useState<FlashSessionWithChunks[]>([])
  const [activeSession, setActiveSession] = useState<FlashSessionWithChunks | null>(null)
  const [clockMs, setClockMs] = useState(() => Date.now())
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [selectedChunkId, setSelectedChunkId] = useState('')
  const [rightTab, setRightTab] = useState<'summary' | 'details'>('summary')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const loadFlashData = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const [historySessions, active] = await Promise.all([
      api.getFlashSessions(),
      api.getActiveFlashSession(),
    ])
    setSessions(historySessions)
    setActiveSession(active)
    setSelectedSessionId((prev) => prev || active?.sessionId || historySessions[0]?.sessionId || '')
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFlashData()
    }, 0)
    const unbind = window.electronAPI?.onFlashStateChanged(() => {
      void loadFlashData()
    })
    return () => {
      clearTimeout(timer)
      unbind?.()
    }
  }, [loadFlashData])

  useEffect(() => {
    if (!activeSession) return
    const id = window.setInterval(() => setClockMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeSession])

  const selectedSession = useMemo((): FlashSessionWithChunks | null => {
    if (activeSession) return activeSession
    return sessions.find((s) => s.sessionId === selectedSessionId) ?? sessions[0] ?? null
  }, [activeSession, sessions, selectedSessionId])

  const resolvedChunkId = useMemo(() => {
    if (!selectedSession) return ''
    const first = selectedSession.chunks[0]
    if (!first) return ''
    if (selectedSession.chunks.some((s) => s.chunkId === selectedChunkId)) {
      return selectedChunkId
    }
    return first.chunkId
  }, [selectedSession, selectedChunkId])

  const selectedChunk = useMemo(() => {
    if (!selectedSession || !resolvedChunkId) return null
    return selectedSession.chunks.find((s) => s.chunkId === resolvedChunkId) ?? null
  }, [selectedSession, resolvedChunkId])

  const selectedHistoryForSelect = useMemo(() => {
    return sessions.find((r) => r.sessionId === selectedSessionId) ?? null
  }, [sessions, selectedSessionId])

  const selectTriggerDisplay = useMemo(() => {
    if (!selectedHistoryForSelect) return ''
    return formatSelectOptionLabel(
      selectedHistoryForSelect.sessionId,
      new Date(selectedHistoryForSelect.startedAt).getTime(),
    )
  }, [selectedHistoryForSelect])

  const onStart = useCallback(() => {
    void window.electronAPI
      ?.startFlashSession()
      .then((result) => {
        setSelectedSessionId(result.sessionId)
        toast.success('闪记已开始')
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t('common.unknownError'))
      })
  }, [t])

  const onEnd = useCallback(() => {
    void window.electronAPI
      ?.endFlashSession()
      .then(() => {
        toast.success('闪记结束，正在处理分片')
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t('common.unknownError'))
      })
  }, [t])

  const onRecordChange = (value: string) => {
    if (activeSession) return
    setSelectedSessionId(value)
    const rec = sessions.find((r) => r.sessionId === value)
    const first = rec?.chunks[0]
    if (first) setSelectedChunkId(first.chunkId)
  }

  const playChunk = useCallback(
    async (chunk: FlashChunk) => {
      if (!chunk.audioPath) {
        toast.message('当前片段暂无本地音频文件')
        return
      }
      if (audioRef.current) {
        audioRef.current.pause()
      }
      const audio = new Audio(`file://${chunk.audioPath}`)
      audioRef.current = audio
      try {
        await audio.play()
      } catch {
        await window.electronAPI?.playFlashChunk(chunk.chunkId)
      }
    },
    [audioRef],
  )

  const downloadChunk = useCallback(async (chunk: FlashChunk) => {
    const result = await window.electronAPI?.downloadFlashChunk(chunk.chunkId)
    if (result?.savedPath) {
      toast.success('下载成功')
    }
  }, [])

  const onSessionSummarize = useCallback(() => {
    if (activeSession) {
      toast.message(t('sketches.summaryNeedEndFirst'))
      return
    }
    if (!selectedSession) {
      toast.message(t('sketches.summaryNoSession'))
      return
    }
    if (selectedSession.chunks.length === 0) {
      toast.message(t('sketches.summaryNoSegments'))
      return
    }
    toast.success(t('sketches.summaryQueuedToast'))
  }, [activeSession, selectedSession, t])

  const liveElapsed = activeSession
    ? formatElapsed(clockMs - new Date(activeSession.startedAt).getTime())
    : '00:00:00'
  const liveClock = activeSession ? formatLiveClock(clockMs) : ''

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3 pt-3 max-w-full">
      <div className="flex shrink-0 flex-col gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-nowrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={activeSession !== null}
            onClick={onStart}
          >
            {t('sketches.start')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={activeSession === null}
            onClick={onEnd}
          >
            {t('sketches.end')}
          </Button>

          {activeSession ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground sm:text-sm">
                <span>{t('sketches.idLabel')}</span>
                <span> · </span>
                <span className="font-semibold text-foreground">{activeSession.sessionId}</span>
                <span> · </span>
                <span>{formatToMinute(new Date(activeSession.startedAt).getTime())}</span>
              </p>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center">
              <Select value={selectedSessionId} onValueChange={onRecordChange}>
                <SelectTrigger
                  id="sketch-record-select"
                  size="default"
                  className="h-9 min-w-0 w-full justify-between font-mono text-base font-semibold tracking-tight data-[size=default]:h-9"
                >
                  <SelectValue>{`${t('sketches.idLabel')} · ${selectTriggerDisplay}`}</SelectValue>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  className="max-h-[min(24rem,70vh)] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]"
                >
                  {sessions.map((rec) => (
                    <SelectItem key={rec.sessionId} value={rec.sessionId} className="font-mono">
                      {formatSelectOptionLabel(rec.sessionId, new Date(rec.startedAt).getTime())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(12rem,22rem)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3">
        <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          {selectedSession ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={onSessionSummarize}
                >
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {t('sketches.summaryAiButton')}
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      title={t('sketches.summaryPromptLabel')}
                      aria-label={t('sketches.summaryPromptLabel')}
                    >
                      <ScrollText className="size-4" aria-hidden />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[min(85vh,36rem)] sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{t('sketches.summaryPromptLabel')}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[min(60vh,24rem)] overflow-y-auto rounded-md border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {t('sketches.summaryPromptDefault')}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {selectedSession.chunks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('sketches.duringRecordingSidebar')}
                  </p>
                ) : (
                  selectedSession.chunks.map((seg) => {
                    const selected = resolvedChunkId === seg.chunkId
                    const timeRange = `${formatHm(new Date(seg.startedAt).getTime(), locale)} – ${formatHm(new Date(seg.endedAt).getTime(), locale)}`
                    return (
                      <div
                        key={seg.chunkId}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => setSelectedChunkId(seg.chunkId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedChunkId(seg.chunkId)
                          }
                        }}
                        className={cn(
                          'no-drag relative w-full cursor-pointer rounded-lg border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          selected
                            ? 'border-primary bg-muted/60 shadow-sm'
                            : 'border-border bg-background hover:bg-muted/40',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-muted-foreground">
                            {seg.chunkIndex}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-snug">
                              {t('sketches.recordingFile', { n: seg.chunkIndex })}
                            </div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">
                              {timeRange}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{seg.status}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={(event) => {
                                event.stopPropagation()
                                void playChunk(seg)
                              }}
                            >
                              <Play className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={(event) => {
                                event.stopPropagation()
                                void downloadChunk(seg)
                              }}
                            >
                              <Download className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          ) : null}
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <Tabs
            value={rightTab}
            onValueChange={(v) => setRightTab(v as 'summary' | 'details')}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="shrink-0 border-b px-4 pt-3">
              <TabsList>
                <TabsTrigger value="summary">{t('sketches.tabSummary')}</TabsTrigger>
                <TabsTrigger value="details">{t('sketches.tabDetails')}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="summary"
              className="m-0 min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 data-[state=inactive]:hidden"
            >
              {selectedChunk ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-foreground">
                    {t('sketches.recordingFile', { n: selectedChunk.chunkIndex })}{' '}
                    <span className="font-mono text-muted-foreground">
                      (
                      {`${formatHm(new Date(selectedChunk.startedAt).getTime(), locale)} – ${formatHm(new Date(selectedChunk.endedAt).getTime(), locale)}`}
                      )
                    </span>
                  </p>
                  <p>{t('sketches.summaryIntro')}</p>
                </div>
              ) : activeSession ? (
                <p className="text-sm text-muted-foreground">
                  {t('sketches.duringRecordingRight')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('sketches.noSegmentSelected')}</p>
              )}
            </TabsContent>
            <TabsContent
              value="details"
              className="m-0 min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 data-[state=inactive]:hidden"
            >
              {selectedChunk ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-foreground">
                    {t('sketches.recordingFile', { n: selectedChunk.chunkIndex })}{' '}
                    <span className="font-mono text-muted-foreground">
                      (
                      {`${formatHm(new Date(selectedChunk.startedAt).getTime(), locale)} – ${formatHm(new Date(selectedChunk.endedAt).getTime(), locale)}`}
                      )
                    </span>
                  </p>
                  <p>{selectedChunk.transcript || t('sketches.detailsIntro')}</p>
                </div>
              ) : activeSession ? (
                <p className="text-sm text-muted-foreground">
                  {t('sketches.duringRecordingRight')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('sketches.noSegmentSelected')}</p>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>

      {activeSession ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10">
          <div className="rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="default" className="px-1.5 py-0 text-[10px] font-normal">
                {t('sketches.recordingStatus')}
              </Badge>
              <span>{liveClock}</span>
              <span>{t('sketches.elapsedLabel')}</span>
              <span className="font-mono text-foreground">{liveElapsed}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
