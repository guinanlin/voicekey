import * as React from 'react'
import { Search, Filter, Copy, Trash2 } from 'lucide-react'
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

interface HistoryItem {
  id: string
  text: string
  timestamp: number
  duration?: number
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest')
  const [items, setItems] = React.useState<HistoryItem[]>([])
  const [loading, setLoading] = React.useState(true)

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
      const data = await window.electronAPI.getHistory()
      setItems(data)
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
    const unsub = window.electronAPI.onHistoryChanged(() => {
      void loadHistory()
    })
    return unsub
  }, [loadHistory])

  const filteredItems = React.useMemo(() => {
    const filtered = items.filter((item) =>
      item.text.toLowerCase().includes(searchQuery.toLowerCase()),
    )

    return filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      }
      return a.timestamp - b.timestamp
    })
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
      await window.electronAPI.clearHistory()
      setItems([])
      toast.success(t('history.clearSuccess'))
    } catch (error) {
      // eslint-disable-next-line no-console -- report clear failure
      console.error('Failed to clear history:', error)
      toast.error(t('history.clearFailed'))
    }
  }, [t])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t('history.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col h-full -my-6">
      <div className="flex items-center justify-between gap-4 shrink-0 pb-2 mb-2 pt-6">
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
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {items.length > 0 ? (
            <span>
              {formatNumber(items.length)}
              {t('history.recordCountShort', { defaultValue: ' 条' })}
            </span>
          ) : (
            <span>{t('history.empty')}</span>
          )}
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
                      className="group relative flex items-start gap-3 px-2 py-2 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-relaxed line-clamp-3 selection:bg-primary/20">
                          {item.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatTime(item.timestamp)}</span>
                          {item.duration && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>
                                {t('time.seconds', {
                                  count: Math.round(item.duration / 1000),
                                  formattedCount: formatNumber(Math.round(item.duration / 1000)),
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(item.text)}
                          title={t('history.copyTitle')}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteItem(item.id)}
                          title={t('history.deleteTitle')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
