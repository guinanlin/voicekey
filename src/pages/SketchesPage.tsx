import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLocale } from '@electron/shared/i18n'
import { Sparkles, TextQuote } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SketchSegment {
  id: string
  index: number
  timeRange: string
}

interface FlashNoteRecord {
  id: string
  /** 本条闪记点击「开始」的时间 */
  startedAt: number
  /** 点击「结束」固定的时间；用于历史排序（最新结束靠前） */
  endedAt: number
  segments: SketchSegment[]
}

interface LiveSession {
  id: string
  startedAt: number
}

function makeSegments(recordId: string, ranges: string[]): SketchSegment[] {
  return ranges.map((timeRange, i) => ({
    id: `seg-${recordId}-${i + 1}`,
    index: i + 1,
    timeRange,
  }))
}

function nextFlashNoteId(): string {
  return String(Date.now())
}

/** 初始历史：`endedAt` 用于排序；列表与下拉展示以 `startedAt` 为主 */
const INITIAL_HISTORY: FlashNoteRecord[] = [
  {
    id: '12890',
    startedAt: new Date('2026-03-07T14:00:00').getTime(),
    endedAt: new Date('2026-03-07T14:30:00').getTime(),
    segments: makeSegments('12890', ['7:15 – 7:20', '7:20 – 7:25']),
  },
  {
    id: '12601',
    startedAt: new Date('2026-03-05T08:50:00').getTime(),
    endedAt: new Date('2026-03-05T09:12:00').getTime(),
    segments: makeSegments('12601', ['8:00 – 8:12']),
  },
  {
    id: '12345',
    startedAt: new Date('2026-03-01T07:05:00').getTime(),
    endedAt: new Date('2026-03-01T07:18:00').getTime(),
    segments: makeSegments('12345', ['7:15 – 7:20', '7:20 – 7:25']),
  },
  {
    id: '11802',
    startedAt: new Date('2026-02-20T16:20:00').getTime(),
    endedAt: new Date('2026-02-20T16:45:00').getTime(),
    segments: makeSegments('11802', ['16:30 – 16:40', '16:40 – 16:45']),
  },
  {
    id: '10200',
    startedAt: new Date('2026-01-10T10:50:00').getTime(),
    endedAt: new Date('2026-01-10T11:00:00').getTime(),
    segments: makeSegments('10200', ['10:55 – 11:00']),
  },
]

function sortHistory(records: FlashNoteRecord[]): FlashNoteRecord[] {
  return [...records].sort((a, b) => b.endedAt - a.endedAt)
}

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

function initialHistorySorted(): FlashNoteRecord[] {
  return sortHistory(INITIAL_HISTORY)
}

const textareaClass =
  'border-input placeholder:text-muted-foreground text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 min-h-[5.5rem] w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm'

export default function SketchesPage() {
  const { t, i18n } = useTranslation()
  const locale = getLocale(i18n.language)

  const [history, setHistory] = useState<FlashNoteRecord[]>(initialHistorySorted)
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null)
  const [clockMs, setClockMs] = useState(() => 0)
  const [selectedRecordId, setSelectedRecordId] = useState(
    () => initialHistorySorted()[0]?.id ?? '',
  )
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [rightTab, setRightTab] = useState<'summary' | 'details'>('summary')
  const [summaryPrompt, setSummaryPrompt] = useState(() => t('sketches.summaryPromptDefault'))

  const historySorted = useMemo(() => sortHistory(history), [history])

  useEffect(() => {
    setSummaryPrompt(t('sketches.summaryPromptDefault'))
    // 仅在切换语言时重置默认提示词（避免随 t 引用变化反复覆盖用户编辑）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n.language
  }, [i18n.language])

  useEffect(() => {
    if (!liveSession) return
    const id = window.setInterval(() => {
      setClockMs(Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [liveSession])

  const activeRecord = useMemo((): FlashNoteRecord | null => {
    if (liveSession) {
      return {
        id: liveSession.id,
        startedAt: liveSession.startedAt,
        endedAt: 0,
        segments: [],
      }
    }
    return historySorted.find((r) => r.id === selectedRecordId) ?? historySorted[0] ?? null
  }, [liveSession, historySorted, selectedRecordId])

  const resolvedSegmentId = useMemo(() => {
    if (!activeRecord || liveSession) return ''
    const first = activeRecord.segments[0]
    if (!first) return ''
    if (activeRecord.segments.some((s) => s.id === selectedSegmentId)) {
      return selectedSegmentId
    }
    return first.id
  }, [activeRecord, liveSession, selectedSegmentId])

  const selectedSegment = useMemo(() => {
    if (!activeRecord || liveSession || !resolvedSegmentId) return null
    return activeRecord.segments.find((s) => s.id === resolvedSegmentId) ?? null
  }, [activeRecord, liveSession, resolvedSegmentId])

  const selectedHistoryForSelect = useMemo(() => {
    return historySorted.find((r) => r.id === selectedRecordId) ?? null
  }, [historySorted, selectedRecordId])

  const selectTriggerDisplay = useMemo(() => {
    if (!selectedHistoryForSelect) return ''
    return formatSelectOptionLabel(selectedHistoryForSelect.id, selectedHistoryForSelect.startedAt)
  }, [selectedHistoryForSelect])

  const onStart = useCallback(() => {
    if (liveSession) return
    const t0 = Date.now()
    setLiveSession({ id: nextFlashNoteId(), startedAt: t0 })
    setClockMs(t0)
  }, [liveSession])

  const onEnd = useCallback(() => {
    if (!liveSession) return
    const endedAt = Date.now()
    const range = `${formatHm(liveSession.startedAt, locale)} – ${formatHm(endedAt, locale)}`
    const next: FlashNoteRecord = {
      id: liveSession.id,
      startedAt: liveSession.startedAt,
      endedAt,
      segments: makeSegments(liveSession.id, [range]),
    }
    setHistory((prev) => sortHistory([next, ...prev]))
    setLiveSession(null)
    setSelectedRecordId(next.id)
    setSelectedSegmentId(next.segments[0].id)
  }, [liveSession, locale])

  const onRecordChange = (value: string) => {
    if (liveSession) return
    setSelectedRecordId(value)
    const rec = historySorted.find((r) => r.id === value)
    const first = rec?.segments[0]
    if (first) setSelectedSegmentId(first.id)
  }

  const onAiSummaryAll = useCallback(() => {
    if (liveSession) {
      toast.message(t('sketches.summaryNeedEndFirst'))
      return
    }
    const rec = activeRecord
    if (!rec || rec.segments.length === 0) {
      toast.message(t('sketches.summaryNoSegments'))
      return
    }
    setRightTab('summary')
    toast.success(t('sketches.summaryQueuedToast'))
    // 接入后端时：在此传入 rec.id、rec.segments、summaryPrompt
  }, [liveSession, activeRecord, t])

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] max-w-full min-w-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex flex-nowrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={liveSession !== null}
            onClick={onStart}
          >
            {t('sketches.start')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={liveSession === null}
            onClick={onEnd}
          >
            {t('sketches.end')}
          </Button>

          {liveSession ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Badge variant="default" className="shrink-0 font-normal">
                {t('sketches.recordingStatus')}
              </Badge>
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground sm:text-sm">
                <span>{t('sketches.idLabel')}</span>
                <span> · </span>
                <span className="font-semibold text-foreground">{liveSession.id}</span>
                <span> · </span>
                <span>{formatToMinute(liveSession.startedAt)}</span>
                <span> · </span>
                <span>{formatLiveClock(clockMs)}</span>
                <span> · </span>
                <span>{t('sketches.elapsedLabel')}</span>
                <span> </span>
                <span>{formatElapsed(clockMs - liveSession.startedAt)}</span>
              </p>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center">
              <Select value={selectedRecordId} onValueChange={onRecordChange}>
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
                  {historySorted.map((rec) => (
                    <SelectItem key={rec.id} value={rec.id} className="font-mono">
                      {formatSelectOptionLabel(rec.id, rec.startedAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(12rem,22rem)_minmax(0,1fr)] gap-3">
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          {activeRecord ? (
            <>
              <div className="flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
                {liveSession ? (
                  <>
                    <Badge variant="default" className="shrink-0 text-[10px] font-normal">
                      {t('sketches.recordingStatus')}
                    </Badge>
                    <p className="min-w-0 flex-1 truncate text-xs leading-snug sm:text-sm">
                      <span className="text-muted-foreground">{t('sketches.idLabel')}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono font-semibold text-foreground">
                        {liveSession.id}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono">{formatToMinute(liveSession.startedAt)}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono">{formatLiveClock(clockMs)}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-muted-foreground">
                        {t('sketches.elapsedLabel')}
                      </span>{' '}
                      <span className="font-mono">
                        {formatElapsed(clockMs - liveSession.startedAt)}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2"
                            onClick={onAiSummaryAll}
                            aria-label={t('sketches.summaryAiButton')}
                          >
                            <Sparkles className="size-4" aria-hidden />
                            <span>{t('sketches.summaryAiButton')}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {t('sketches.summaryAiButton')}
                        </TooltipContent>
                      </Tooltip>
                      <Dialog>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DialogTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-8"
                                aria-label={t('sketches.summaryPromptLabel')}
                              >
                                <TextQuote className="size-4" aria-hidden />
                              </Button>
                            </DialogTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {t('sketches.summaryPromptLabel')}
                          </TooltipContent>
                        </Tooltip>
                        <DialogContent className="gap-4 sm:max-w-xl">
                          <DialogHeader>
                            <DialogTitle>{t('sketches.summaryPromptLabel')}</DialogTitle>
                          </DialogHeader>
                          <textarea
                            value={summaryPrompt}
                            onChange={(e) => setSummaryPrompt(e.target.value)}
                            className={textareaClass}
                            spellCheck={false}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </>
                )}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {liveSession ? (
                  <p className="text-sm text-muted-foreground">
                    {t('sketches.duringRecordingSidebar')}
                  </p>
                ) : (
                  activeRecord.segments.map((seg) => {
                    const selected = resolvedSegmentId === seg.id
                    return (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => setSelectedSegmentId(seg.id)}
                        className={cn(
                          'no-drag w-full rounded-lg border p-3 text-left text-sm transition-colors',
                          selected
                            ? 'border-primary bg-muted/60 shadow-sm'
                            : 'border-border bg-background hover:bg-muted/40',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="font-medium text-muted-foreground">{seg.index}.</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-snug">
                              {t('sketches.recordingFile', { n: seg.index })}
                            </div>
                            <div className="mt-1 font-mono text-xs text-muted-foreground">
                              {seg.timeRange}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <Tabs
            value={rightTab}
            onValueChange={(v) => setRightTab(v as 'summary' | 'details')}
            className="flex h-full min-h-0 flex-col gap-0"
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
              {liveSession ? (
                <p className="text-sm text-muted-foreground">
                  {t('sketches.duringRecordingRight')}
                </p>
              ) : selectedSegment ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-foreground">
                    {t('sketches.recordingFile', { n: selectedSegment.index })}{' '}
                    <span className="font-mono text-muted-foreground">
                      ({selectedSegment.timeRange})
                    </span>
                  </p>
                  <p>{t('sketches.summaryIntro')}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('sketches.noSegmentSelected')}</p>
              )}
            </TabsContent>
            <TabsContent
              value="details"
              className="m-0 min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 data-[state=inactive]:hidden"
            >
              {liveSession ? (
                <p className="text-sm text-muted-foreground">
                  {t('sketches.duringRecordingRight')}
                </p>
              ) : selectedSegment ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-foreground">
                    {t('sketches.recordingFile', { n: selectedSegment.index })}{' '}
                    <span className="font-mono text-muted-foreground">
                      ({selectedSegment.timeRange})
                    </span>
                  </p>
                  <p>{t('sketches.detailsIntro')}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('sketches.noSegmentSelected')}</p>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  )
}
