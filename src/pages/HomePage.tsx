import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'

import InteractiveCharts, { HistoryItem } from '@/components/InteractiveCharts'
import StatsOverview from '@/components/StatsOverview'
import ServiceStatusCard from '@/components/ServiceStatusCard'

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
        const loadedConfig = await window.electronAPI?.getConfig?.()
        if (loadedConfig) setConfig(loadedConfig)
      } catch (error) {
        // eslint-disable-next-line no-console -- report config load failure
        console.error('Failed to load config:', error)
      }
    }
    loadConfig()
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) {
      setLoading(false)
      return
    }

    const loadHistory = async () => {
      try {
        setLoading(true)
        const data = await api.getHistory()
        setHistoryItems(data)
      } catch (error) {
        // eslint-disable-next-line no-console -- report history load failure
        console.error('Failed to load history:', error)
      } finally {
        setLoading(false)
      }
    }
    void loadHistory()
    return api.onHistoryChanged(() => {
      void loadHistory()
    })
  }, [])

  return (
    <div className="flex min-h-full max-w-4xl flex-col gap-3 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-foreground">{t('home.title')}</h1>
        {loading ? <Badge variant="outline">{t('common.loadingHistory')}</Badge> : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 min-h-0">
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch">
          <div className="flex-1 flex min-h-0">
            <ServiceStatusCard />
          </div>
          <div className="flex-1 flex flex-col gap-2.5 min-h-0">
            <StatsOverview historyItems={historyItems} />
          </div>
        </div>

        <InteractiveCharts historyItems={historyItems} loading={loading} />
      </div>

      <p className="shrink-0 self-end max-w-md text-right text-xs leading-relaxed text-muted-foreground">
        <Trans
          i18nKey="home.subtitle"
          values={{ hotkey: config.hotkey.pttKey || 'Ctrl+Shift+Space' }}
          components={{ kbd: <Kbd className="bg-primary text-primary-foreground" /> }}
        />
      </p>
    </div>
  )
}
