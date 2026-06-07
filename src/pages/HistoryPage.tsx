import * as React from 'react'
import { Search, Filter, Copy, Trash2, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getLocale } from '@electron/shared/i18n'
import type { VoiceCommandId, VoiceCommandItem } from '@electron/shared/types'
import { findVoiceCommandById } from '@electron/shared/voice-commands'
import { ChatPanel, type ChatPanelHandle, type StartCommandParams } from '@/components/ChatPanel'

interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

const DISPLAY_LIMIT = 10

const HISTORY_ITEM_TOOLS = [
  { id: 'polish', labelKey: 'history.tools.polish' },
  { id: 'summarize', labelKey: 'history.tools.summarize' },
  { id: 'translate', labelKey: 'history.tools.translate' },
  { id: 'wechat', labelKey: 'history.tools.wechat' },
  { id: 'twitter', labelKey: 'history.tools.twitter' },
  { id: 'email', labelKey: 'history.tools.email' },
] as const

type HistoryToolId = (typeof HISTORY_ITEM_TOOLS)[number]['id']

const TOOL_TO_COMMAND_ID: Record<HistoryToolId, VoiceCommandId> = {
  polish: 'polish',
  summarize: 'summary',
  translate: 'translate',
  wechat: 'wechat',
  twitter: 'twitter',
  email: 'email',
}

const RIGHT_PANEL_KEY = 'voicekey-craftsman-right-panel'
const SPLIT_RATIO_KEY = 'voicekey-craftsman-split-ratio'
const MIN_PANEL_RATIO = 0.25
const MAX_PANEL_RATIO = 0.75
const DEFAULT_SPLIT_RATIO = 0.5

function readRightPanelOpen(): boolean {
  try {
    return localStorage.getItem(RIGHT_PANEL_KEY) === '1'
  } catch {
    return false
  }
}

function readSplitRatio(): number {
  try {
    const raw = localStorage.getItem(SPLIT_RATIO_KEY)
    if (raw === null) return DEFAULT_SPLIT_RATIO
    const n = Number.parseFloat(raw)
    if (!Number.isFinite(n)) return DEFAULT_SPLIT_RATIO
    return Math.min(MAX_PANEL_RATIO, Math.max(MIN_PANEL_RATIO, n))
  } catch {
    return DEFAULT_SPLIT_RATIO
  }
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [items, setItems] = React.useState<HistoryItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [rightPanelOpen, setRightPanelOpen] = React.useState(readRightPanelOpen)
  const [leftRatio, setLeftRatio] = React.useState(readSplitRatio)
  const [voiceCommands, setVoiceCommands] = React.useState<VoiceCommandItem[]>([])
  const [pendingCommand, setPendingCommand] = React.useState<StartCommandParams | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const chatRef = React.useRef<ChatPanelHandle>(null)
  const draggingRef = React.useRef(false)
  const leftRatioRef = React.useRef(leftRatio)

  React.useEffect(() => {
    leftRatioRef.current = leftRatio
  }, [leftRatio])

  const openRightPanel = React.useCallback(() => {
    setRightPanelOpen((prev) => {
      if (prev) return prev
      try {
        localStorage.setItem(RIGHT_PANEL_KEY, '1')
      } catch {
        /* ignore quota / private mode */
      }
      return true
    })
  }, [])

  const toggleRightPanel = React.useCallback(() => {
    setRightPanelOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem(RIGHT_PANEL_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota / private mode */
      }
      return next
    })
  }, [])

  React.useEffect(() => {
    const loadCommands = async () => {
      try {
        const config = await window.electronAPI?.getConfig?.()
        if (config?.voiceCommands?.commands) {
          setVoiceCommands(config.voiceCommands.commands)
        }
      } catch {
        /* ignore */
      }
    }
    void loadCommands()
  }, [])

  React.useEffect(() => {
    if (!pendingCommand || !rightPanelOpen) return
    void chatRef.current?.startCommand(pendingCommand).finally(() => setPendingCommand(null))
  }, [pendingCommand, rightPanelOpen])

  const runHistoryTool = React.useCallback(
    (toolId: HistoryToolId, item: HistoryItem) => {
      const text = item.text.trim()
      if (!text) {
        toast.error(t('history.chat.emptySource'))
        return
      }

      const commandId = TOOL_TO_COMMAND_ID[toolId]
      const cmd = findVoiceCommandById(voiceCommands, commandId)
      if (!cmd) {
        toast.error(t('history.chat.requestFailed'))
        return
      }

      const params: StartCommandParams = {
        commandId,
        commandLabel: t(`settings.commands.items.${commandId}.name`),
        systemPrompt: cmd.prompt,
        text,
      }

      openRightPanel()
      if (rightPanelOpen && chatRef.current) {
        void chatRef.current.startCommand(params)
      } else {
        setPendingCommand(params)
      }
    },
    [voiceCommands, openRightPanel, rightPanelOpen, t],
  )

  const beginResize = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  React.useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const { left, width } = containerRef.current.getBoundingClientRect()
      if (width <= 0) return
      const ratio = (e.clientX - left) / width
      setLeftRatio(Math.min(MAX_PANEL_RATIO, Math.max(MIN_PANEL_RATIO, ratio)))
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem(SPLIT_RATIO_KEY, String(leftRatioRef.current))
      } catch {
        /* ignore quota / private mode */
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const locale = getLocale(i18n.language)
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale])

  const formatNumber = React.useCallback(
    (value: number) => numberFormatter.format(value),
    [numberFormatter],
  )

  const formatTime = React.useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp)
      return new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: 'numeric',
      }).format(date)
    },
    [locale],
  )

  const formatDateGroup = React.useCallback(
    (timestamp: number) => {
      const date = new Date(timestamp)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

      if (itemDate.getTime() === today.getTime()) return t('history.today')
      if (itemDate.getTime() === yesterday.getTime()) return t('history.yesterday')

      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: itemDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      }).format(date)
    },
    [locale, t],
  )

  const loadHistory = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await window.electronAPI?.getHistory?.()
      setItems(data ?? [])
    } catch (error) {
      // eslint-disable-next-line no-console -- report history load failure
      console.error('Failed to load history:', error)
      toast.error(t('history.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    loadHistory()
  }, [loadHistory])

  React.useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    return api.onHistoryChanged(() => {
      void loadHistory()
    })
  }, [loadHistory])

  const filteredItems = React.useMemo(() => {
    const filtered = items.filter((item) =>
      item.text.toLowerCase().includes(searchQuery.toLowerCase()),
    )

    const sorted = filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      }
      return a.timestamp - b.timestamp
    })
    return sorted.slice(0, DISPLAY_LIMIT)
  }, [items, searchQuery, sortOrder])

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {}
    filteredItems.forEach((item) => {
      const group = formatDateGroup(item.timestamp)
      if (!groups[group]) groups[group] = []
      groups[group].push(item)
    })
    return groups
  }, [filteredItems, formatDateGroup])

  const copyToClipboard = React.useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text)
      toast.success(t('history.copySuccess'))
    },
    [t],
  )

  const deleteItem = React.useCallback(
    async (id: string) => {
      try {
        if (!window.electronAPI?.deleteHistoryItem) return
        await window.electronAPI.deleteHistoryItem(id)
        setItems((prev) => prev.filter((item) => item.id !== id))
        toast.success(t('history.deleteSuccess'))
      } catch (error) {
        // eslint-disable-next-line no-console -- report delete failure
        console.error('Failed to delete item:', error)
        toast.error(t('history.deleteFailed'))
      }
    },
    [t],
  )

  const clearAll = React.useCallback(async () => {
    if (!window.confirm(t('history.clearConfirm'))) return
    try {
      if (!window.electronAPI?.clearHistory) return
      await window.electronAPI.clearHistory()
      setItems([])
      toast.success(t('history.clearSuccess'))
    } catch (error) {
      // eslint-disable-next-line no-console -- report clear failure
      console.error('Failed to clear history:', error)
      toast.error(t('history.clearFailed'))
    }
  }, [t])

  const historyPanel = loading ? (
    <div className="flex h-64 items-center justify-center py-4">
      <p className="text-muted-foreground">{t('history.loading')}</p>
    </div>
  ) : (
    <>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs group/search">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70 group-focus-within/search:text-primary transition-colors" />
            <Input
              placeholder={t('history.searchPlaceholder')}
              className="pl-9 bg-secondary/30 border-transparent hover:bg-secondary/50 focus:bg-background transition-all duration-200"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'newest' | 'oldest')}>
            <SelectTrigger className="w-[120px] bg-secondary/30 border-transparent hover:bg-secondary/50 transition-colors">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <SelectValue placeholder={t('history.sortPlaceholder')} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('history.sortNewest')}</SelectItem>
              <SelectItem value="oldest">{t('history.sortOldest')}</SelectItem>
            </SelectContent>
          </Select>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-0.5 text-sm text-muted-foreground whitespace-nowrap">
          {items.length > 0 ? (
            <span>
              {formatNumber(items.length)}
              {t('history.recordCountShort', { defaultValue: ' 条' })}
            </span>
          ) : (
            <span>{t('history.empty')}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={toggleRightPanel}
            title={rightPanelOpen ? t('history.collapseRightPanel') : t('history.expandRightPanel')}
            aria-expanded={rightPanelOpen}
            aria-label={
              rightPanelOpen ? t('history.collapseRightPanel') : t('history.expandRightPanel')
            }
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-border/40">
        {Object.entries(groupedItems).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="bg-secondary/30 p-8 rounded-full mb-6 ring-1 ring-border/50">
              <Search className="h-10 w-10 opacity-40 text-primary/60" />
            </div>
            <p className="text-lg font-medium text-foreground/80">
              {items.length === 0 ? t('history.emptyTitleNone') : t('history.emptyTitleNoMatch')}
            </p>
            <p className="text-sm mt-2 text-muted-foreground/60 max-w-xs text-center">
              {items.length === 0 ? t('history.emptyDescNone') : t('history.emptyDescNoMatch')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {Object.entries(groupedItems).map(([group, groupItems]) => (
              <div key={group} className="py-3 first:pt-0 last:pb-0">
                <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2 px-2">
                  {group}
                </h3>
                <div className="space-y-1">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex flex-col gap-1.5 px-2 py-2 hover:bg-secondary/30 transition-colors"
                    >
                      <p className="text-sm text-foreground leading-relaxed line-clamp-3 selection:bg-primary/20">
                        {item.text}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatTime(item.timestamp)}</span>
                          {item.duration ? (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>
                                {t('time.seconds', {
                                  count: Math.round(item.duration / 1000),
                                  formattedCount: formatNumber(Math.round(item.duration / 1000)),
                                })}
                              </span>
                            </>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto opacity-0 transition-opacity group-hover:opacity-100">
                          {HISTORY_ITEM_TOOLS.map((tool) => (
                            <Button
                              key={tool.id}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-5 shrink-0 px-1.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                              title={t(tool.labelKey)}
                              onClick={() => runHistoryTool(tool.id, item)}
                            >
                              {t(tool.labelKey)}
                            </Button>
                          ))}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => copyToClipboard(item.text)}
                            title={t('history.copyTitle')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteItem(item.id)}
                            title={t('history.deleteTitle')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  const rightRatio = 1 - leftRatio

  return (
    <div
      ref={containerRef}
      className="grid h-full min-h-0 -mb-6"
      style={{
        gridTemplateColumns: rightPanelOpen ? `${leftRatio}fr 6px ${rightRatio}fr` : '1fr',
      }}
    >
      <div className="flex min-h-0 min-w-0 flex-col">{historyPanel}</div>
      {rightPanelOpen ? (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(leftRatio * 100)}
            aria-valuemin={Math.round(MIN_PANEL_RATIO * 100)}
            aria-valuemax={Math.round(MAX_PANEL_RATIO * 100)}
            className="group relative flex cursor-col-resize items-stretch justify-center"
            onMouseDown={beginResize}
          >
            <div className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
            <div className="w-px bg-border/50 transition-colors group-hover:bg-border group-active:bg-primary/50" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-secondary/10">
            <ChatPanel ref={chatRef} className="h-full" />
          </div>
        </>
      ) : null}
    </div>
  )
}
