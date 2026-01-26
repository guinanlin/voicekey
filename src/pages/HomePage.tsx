import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'

import InteractiveCharts, { HistoryItem } from '@/components/InteractiveCharts'
import StatsOverview from '@/components/StatsOverview'

interface Config {
  hotkey: {
    pttKey: string
  }
}

export default function HomePage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<Config>({
    hotkey: { pttKey: '' },
  })
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI.getConfig()
        setConfig(loadedConfig)
      } catch (error) {
        // eslint-disable-next-line no-console -- report config load failure
        console.error('Failed to load config:', error)
      }
    }
    loadConfig()
  }, [])

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true)
        const data = await window.electronAPI.getHistory()
        setHistoryItems(data)
      } catch (error) {
        // eslint-disable-next-line no-console -- report history load failure
        console.error('Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }
    loadHistory()
  }, [])

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">{t('home.title')}</h1>
          {loading ? <Badge variant="outline">{t('common.loadingHistory')}</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="home.subtitle"
            values={{ hotkey: config.hotkey.pttKey || 'Ctrl+Shift+Space' }}
            components={{ kbd: <Kbd className="bg-primary text-primary-foreground" /> }}
          />
        </p>
      </div>

      <StatsOverview historyItems={historyItems} />

      <InteractiveCharts historyItems={historyItems} loading={loading} />
    </div>
  )
}
