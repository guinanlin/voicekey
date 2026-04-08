import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AUDIO_CAPTURE_OPUS_BITRATE_OPTIONS,
  DEFAULT_AUDIO_CAPTURE_PREFERENCES,
  ERPNEXTCN_DTY,
  qwenMultimodalGenerationUrl,
  qwenShortAsrModelName,
} from '@electron/shared/constants'
import { resolveLanguage, type LanguageSetting } from '@electron/shared/i18n'
import type { AppConfig, UpdateInfo } from '@electron/shared/types'
import { HotkeySettings } from '@/components/HotkeySettings'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<AppConfig>({
    app: {
      language: 'system',
      autoLaunch: false,
      audioCapture: { ...DEFAULT_AUDIO_CAPTURE_PREFERENCES },
    },
    asr: {
      provider: 'glm',
      region: 'cn',
      apiKeys: {
        cn: '',
        intl: '',
      },
      endpoint: '',
      language: 'auto',
      qwenApiKey: '',
      qwenRegion: 'cn',
      qwenSubmitUrl: '',
    },
    hotkey: {
      pttKey: '',
      flashNoteStart: '',
      flashNoteEnd: '',
      toggleSettings: '',
    },
    erpnextcnDty: {
      host: '',
      apiKey: '',
    },
  })

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showErpnextcnKey, setShowErpnextcnKey] = useState(false)
  const [showQwenApiKey, setShowQwenApiKey] = useState(false)
  const hasLoadedConfig = useRef(false)
  const hasLoadedUpdateStatus = useRef(false)

  useEffect(() => {
    if (hasLoadedConfig.current) return
    hasLoadedConfig.current = true

    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI?.getConfig?.()
        if (!loadedConfig) return
        setConfig(loadedConfig)
        const resolvedLanguage = resolveLanguage(
          loadedConfig.app?.language ?? 'system',
          navigator.language,
        )
        void i18n.changeLanguage(resolvedLanguage)
      } catch (error) {
        // eslint-disable-next-line no-console -- report config load failure
        console.error('Failed to load config:', error)
      }
    }

    loadConfig()
  }, [i18n])

  const handleAppLanguageChange = (value: string) => {
    const setting = value as LanguageSetting
    setConfig((prev) => ({
      ...prev,
      app: {
        ...prev.app,
        language: setting,
      },
    }))
    const resolvedLanguage = resolveLanguage(setting, navigator.language)
    void i18n.changeLanguage(resolvedLanguage)
    const persist = window.electronAPI?.setConfig?.({ app: { language: setting } })
    if (persist) {
      void persist.catch((error) => {
        // eslint-disable-next-line no-console -- report persist failure
        console.error('Failed to persist app language:', error)
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      const api = window.electronAPI
      if (!api) {
        throw new Error('Electron API unavailable')
      }
      const latestConfig = await api.getConfig()

      await api.setConfig({
        ...latestConfig,
        app: config.app,
        asr: config.asr,
        erpnextcnDty: config.erpnextcnDty,
      })

      setTestResult({ type: 'success', message: t('settings.result.saveSuccess') })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setTestResult({
        type: 'error',
        message: t('settings.result.saveError', { message: errorMessage }),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (config.asr.provider === 'qwen') {
      const qk = config.asr.qwenApiKey?.trim() ?? ''
      if (!qk) {
        setTestResult({ type: 'error', message: t('settings.result.qwenApiKeyRequired') })
        return
      }
    } else {
      const region = config.asr.region || 'cn'
      const apiKey = config.asr.apiKeys[region]
      if (!apiKey) {
        setTestResult({ type: 'error', message: t('settings.result.apiKeyRequired') })
        return
      }
    }

    setTesting(true)
    setTestResult(null)
    try {
      if (!window.electronAPI?.testConnection) {
        setTestResult({ type: 'error', message: t('settings.result.connectionFailed') })
        setTesting(false)
        return
      }
      const result = await window.electronAPI.testConnection(config.asr)
      if (result) {
        setTestResult({ type: 'success', message: t('settings.result.connectionSuccess') })
      } else {
        setTestResult({ type: 'error', message: t('settings.result.connectionFailed') })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknownError')
      setTestResult({
        type: 'error',
        message: t('settings.result.testFailed', { message: errorMessage }),
      })
    } finally {
      setTesting(false)
    }
  }

  // Helper to update API Key for current region
  const handleApiKeyChange = (value: string) => {
    const region = config.asr.region || 'cn'
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        apiKeys: {
          ...prev.asr.apiKeys,
          [region]: value,
        },
      },
    }))
  }

  // Helper to change Region
  const handleRegionChange = (value: string) => {
    const region = value as 'cn' | 'intl'
    setConfig((prev) => ({
      ...prev,
      asr: {
        ...prev.asr,
        region,
        endpoint: '', // Clear endpoint to ensure region default is used
      },
    }))
  }

  const isSuccess = testResult?.type === 'success'
  const resultMessage = testResult?.message ?? ''

  const currentRegion = config.asr.region || 'cn'
  const currentApiKey = config.asr.apiKeys?.[currentRegion] || ''
  const qwenDefaultMultimodalUrl = qwenMultimodalGenerationUrl(config.asr.qwenRegion)
  const glmDefaultEndpoint =
    currentRegion === 'intl'
      ? 'https://api.z.ai/api/paas/v4/audio/transcriptions'
      : 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions'

  const opusBitrateSelectModel = useMemo(() => {
    const value =
      config.app.audioCapture?.opusBitsPerSecond ??
      DEFAULT_AUDIO_CAPTURE_PREFERENCES.opusBitsPerSecond
    const presets = [...AUDIO_CAPTURE_OPUS_BITRATE_OPTIONS]
    const inList = presets.includes(value as (typeof AUDIO_CAPTURE_OPUS_BITRATE_OPTIONS)[number])
    const items = inList ? presets : [...presets, value].sort((a, b) => a - b)
    return { value, items }
  }, [config.app.audioCapture?.opusBitsPerSecond])

  // Update Logic
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isPackaged, setIsPackaged] = useState(true)

  useEffect(() => {
    if (hasLoadedUpdateStatus.current) return
    hasLoadedUpdateStatus.current = true

    const api = window.electronAPI
    if (!api) {
      setIsPackaged(false)
      return
    }

    const loadUpdateStatus = async () => {
      try {
        const info = await api.getUpdateStatus()
        if (info) {
          setUpdateInfo(info)
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- report update status load failure
        console.error('Failed to load update status:', error)
      }
    }

    void loadUpdateStatus()

    // 检查是否是打包版本
    void api
      .getIsPackaged()
      .then(setIsPackaged)
      .catch(() => setIsPackaged(true))

    // 监听更新事件
    const unsubscribeProgress = api.onUpdateDownloadProgress((progress) => {
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              status: 'downloading',
              downloadProgress: progress,
            }
          : null,
      )
    })

    const unsubscribeAvailable = api.onUpdateAvailable((event, data) => {
      if (data) {
        setUpdateInfo(data)
      }
      if (event === 'downloaded') {
        setDownloadingUpdate(false)
      }
      if (event === 'error') {
        setDownloadingUpdate(false)
      }
    })

    return () => {
      unsubscribeProgress()
      unsubscribeAvailable()
    }
  }, [])

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateInfo(null)
    try {
      if (!window.electronAPI?.checkForUpdates) {
        setUpdateInfo({
          hasUpdate: false,
          latestVersion: '',
          releaseUrl: '',
          releaseNotes: '',
          error: 'failed',
          status: 'error',
        })
        return
      }
      const info = await window.electronAPI.checkForUpdates()
      setUpdateInfo(info)
    } catch (error) {
      // eslint-disable-next-line no-console -- report update check failure
      console.error('Update check failed:', error)
      setUpdateInfo({
        hasUpdate: false,
        latestVersion: '',
        releaseUrl: '',
        releaseNotes: '',
        error: 'failed',
        status: 'error',
      })
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.hasUpdate) return

    setDownloadingUpdate(true)
    try {
      if (!window.electronAPI?.downloadUpdate) {
        setDownloadingUpdate(false)
        return
      }
      const result = await window.electronAPI.downloadUpdate()
      if (!result.success) {
        setUpdateInfo((prev) =>
          prev
            ? {
                ...prev,
                error: result.error || 'Download failed',
                status: 'error',
              }
            : null,
        )
        setDownloadingUpdate(false)
      }
      // 下载成功会通过事件监听器更新状态
    } catch (error) {
      // eslint-disable-next-line no-console -- report download failure
      console.error('Download update failed:', error)
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              error: error instanceof Error ? error.message : 'Download failed',
              status: 'error',
            }
          : null,
      )
      setDownloadingUpdate(false)
    }
  }

  const handleInstallUpdate = async () => {
    setInstallingUpdate(true)
    try {
      if (!window.electronAPI?.installUpdate) {
        setInstallingUpdate(false)
        return
      }
      const result = await window.electronAPI.installUpdate()
      if (!result.success) {
        // eslint-disable-next-line no-console -- report install failure
        console.error('Install update failed:', result.error)
        setUpdateInfo((prev) =>
          prev
            ? {
                ...prev,
                error: result.error || 'Install failed',
                status: 'error',
              }
            : null,
        )
      }
      // 安装成功会重启应用
    } catch (error) {
      // eslint-disable-next-line no-console -- report install failure
      console.error('Install update failed:', error)
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              error: error instanceof Error ? error.message : 'Install failed',
              status: 'error',
            }
          : null,
      )
    } finally {
      setInstallingUpdate(false)
    }
  }

  const handleOpenRelease = () => {
    const url = updateInfo?.releaseUrl
    if (!url) return
    void window.electronAPI?.openExternal?.(url)
    if (!window.electronAPI?.openExternal) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Tabs defaultValue="general" className="w-full gap-0">
        {/* 吸顶条 py-3 + 底部分隔线 border-b；TabsContent mt-4 与首张 Card 紧凑 */}
        <div className="sticky top-0 z-20 isolate shrink-0 border-b border-border bg-background py-3">
          <TabsList className="inline-flex h-auto min-h-9 w-fit max-w-full flex-wrap items-center justify-start gap-0.5 self-start rounded-md bg-muted/50 p-0.5">
            <TabsTrigger
              value="general"
              className="h-8 flex-none px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.appPreferences')}
            </TabsTrigger>
            <TabsTrigger
              value="llm"
              className="h-8 flex-none px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.bigModelTab')}
            </TabsTrigger>
            <TabsTrigger
              value="storage"
              className="h-8 flex-none px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.storageTab')}
            </TabsTrigger>
            <TabsTrigger
              value="hotkeys"
              className="h-8 flex-none px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('hotkey.title')}
            </TabsTrigger>
            <TabsTrigger
              value="about"
              className="h-8 flex-none px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {t('settings.aboutTab')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">{t('settings.appPreferences')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="appLanguage">{t('settings.appLanguage')}</Label>
                <Select value={config.app.language} onValueChange={handleAppLanguageChange}>
                  <SelectTrigger id="appLanguage" className="no-drag w-full cursor-pointer">
                    <SelectValue placeholder={t('settings.languagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">{t('settings.systemLanguage')}</SelectItem>
                    <SelectItem value="zh">{t('settings.languageChinese')}</SelectItem>
                    <SelectItem value="en">{t('settings.languageEnglish')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="autoLaunch">{t('settings.autoLaunch')}</Label>
                  <p className="text-sm text-muted-foreground">{t('settings.autoLaunchHelp')}</p>
                </div>
                <Switch
                  id="autoLaunch"
                  checked={config.app.autoLaunch ?? false}
                  onCheckedChange={(checked) =>
                    setConfig({
                      ...config,
                      app: { ...config.app, autoLaunch: checked },
                    })
                  }
                  className="no-drag cursor-pointer"
                />
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('settings.audioCaptureSectionTitle')}</p>
                  <Alert className="border-muted-foreground/25 bg-muted/40">
                    <AlertDescription className="text-sm text-muted-foreground">
                      {t('settings.audioCaptureRecommendedHint')}
                    </AlertDescription>
                  </Alert>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="opusBitrate">{t('settings.audioCaptureBitrateLabel')}</Label>
                  <Select
                    value={String(opusBitrateSelectModel.value)}
                    onValueChange={(value) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            opusBitsPerSecond: Number(value),
                          },
                        },
                      }))
                    }
                  >
                    <SelectTrigger id="opusBitrate" className="no-drag w-full cursor-pointer">
                      <SelectValue placeholder={t('settings.languagePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {opusBitrateSelectModel.items.map((bps) => (
                        <SelectItem key={bps} value={String(bps)}>
                          {t('settings.audioCaptureBitrateOption', { kbps: bps / 1000 })}
                          {bps === DEFAULT_AUDIO_CAPTURE_PREFERENCES.opusBitsPerSecond
                            ? ` (${t('settings.audioCaptureBitrateRecommended')})`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.audioCaptureBitrateHelp')}
                  </p>
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="preferMono">{t('settings.audioCapturePreferMono')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.audioCapturePreferMonoHelp')}
                    </p>
                  </div>
                  <Switch
                    id="preferMono"
                    checked={
                      config.app.audioCapture?.preferMono ??
                      DEFAULT_AUDIO_CAPTURE_PREFERENCES.preferMono
                    }
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            preferMono: checked,
                          },
                        },
                      }))
                    }
                    className="no-drag cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="echoCancellation">
                      {t('settings.audioCaptureEchoCancellation')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.audioCaptureEchoCancellationHelp')}
                    </p>
                  </div>
                  <Switch
                    id="echoCancellation"
                    checked={
                      config.app.audioCapture?.echoCancellation ??
                      DEFAULT_AUDIO_CAPTURE_PREFERENCES.echoCancellation
                    }
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            echoCancellation: checked,
                          },
                        },
                      }))
                    }
                    className="no-drag cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="noiseSuppression">
                      {t('settings.audioCaptureNoiseSuppression')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.audioCaptureNoiseSuppressionHelp')}
                    </p>
                  </div>
                  <Switch
                    id="noiseSuppression"
                    checked={
                      config.app.audioCapture?.noiseSuppression ??
                      DEFAULT_AUDIO_CAPTURE_PREFERENCES.noiseSuppression
                    }
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            noiseSuppression: checked,
                          },
                        },
                      }))
                    }
                    className="no-drag cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoGainControl">
                      {t('settings.audioCaptureAutoGainControl')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.audioCaptureAutoGainControlHelp')}
                    </p>
                  </div>
                  <Switch
                    id="autoGainControl"
                    checked={
                      config.app.audioCapture?.autoGainControl ??
                      DEFAULT_AUDIO_CAPTURE_PREFERENCES.autoGainControl
                    }
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            autoGainControl: checked,
                          },
                        },
                      }))
                    }
                    className="no-drag cursor-pointer"
                  />
                </div>

                {(() => {
                  const echo =
                    config.app.audioCapture?.echoCancellation ??
                    DEFAULT_AUDIO_CAPTURE_PREFERENCES.echoCancellation
                  const noise =
                    config.app.audioCapture?.noiseSuppression ??
                    DEFAULT_AUDIO_CAPTURE_PREFERENCES.noiseSuppression
                  if (!echo && noise) {
                    return (
                      <Alert className="border-amber-500/40 bg-amber-500/5">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription>
                          {t('settings.audioCaptureRadioNoiseMismatch')}
                        </AlertDescription>
                      </Alert>
                    )
                  }
                  return null
                })()}

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="micFallback">{t('settings.audioCaptureMicFallback')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.audioCaptureMicFallbackHelp')}
                    </p>
                  </div>
                  <Switch
                    id="micFallback"
                    checked={
                      config.app.audioCapture?.fallbackOnMicConstraintFailure ??
                      DEFAULT_AUDIO_CAPTURE_PREFERENCES.fallbackOnMicConstraintFailure
                    }
                    onCheckedChange={(checked) =>
                      setConfig((prev) => ({
                        ...prev,
                        app: {
                          ...prev.app,
                          audioCapture: {
                            ...DEFAULT_AUDIO_CAPTURE_PREFERENCES,
                            ...prev.app.audioCapture,
                            fallbackOnMicConstraintFailure: checked,
                          },
                        },
                      }))
                    }
                    className="no-drag cursor-pointer"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="llm" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">{t('settings.asrBackendTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="asrProvider">{t('settings.asrBackendLabel')}</Label>
                <Select
                  value={config.asr.provider}
                  onValueChange={(value) =>
                    setConfig((prev) => ({
                      ...prev,
                      asr: {
                        ...prev.asr,
                        provider: value as 'glm' | 'qwen',
                      },
                    }))
                  }
                >
                  <SelectTrigger id="asrProvider" className="no-drag w-full cursor-pointer">
                    <SelectValue placeholder={t('settings.languagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="glm">{t('settings.asrBackendGlm')}</SelectItem>
                    <SelectItem value="qwen">{t('settings.asrBackendQwen')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.asr.provider === 'glm' ? (
                <div className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-base font-semibold leading-none">
                    {t('settings.glmAsrCardTitle')}
                  </h3>
                  <div className="space-y-2">
                    <Label htmlFor="region">{t('settings.region')}</Label>
                    <Select value={currentRegion} onValueChange={handleRegionChange}>
                      <SelectTrigger id="region" className="no-drag w-full cursor-pointer">
                        <SelectValue placeholder={t('settings.languagePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cn">{t('settings.regionChina')}</SelectItem>
                        <SelectItem value="intl">{t('settings.regionIntl')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="apiKey">
                      {t('settings.apiKey')} <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="apiKey"
                        type={showApiKey ? 'text' : 'password'}
                        value={currentApiKey}
                        onChange={(e) => handleApiKeyChange(e.target.value)}
                        placeholder={t('settings.apiKeyPlaceholder')}
                        className="no-drag pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground no-drag"
                        onClick={() => setShowApiKey((v) => !v)}
                        aria-label={
                          showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')
                        }
                        title={showApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                      >
                        {showApiKey ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mr-1">
                      {t('settings.apiKeyHelp')}{' '}
                      <a
                        href={
                          currentRegion === 'intl'
                            ? 'https://z.ai/manage-apikey/apikey-list'
                            : 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {currentRegion === 'intl' ? 'z.ai' : 'bigmodel.cn'}
                      </a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="endpoint">{t('settings.apiEndpoint')}</Label>
                    <Input
                      id="endpoint"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      value={config.asr.endpoint ?? ''}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          asr: { ...prev.asr, endpoint: e.target.value },
                        }))
                      }
                      placeholder={glmDefaultEndpoint}
                      className="no-drag font-mono text-sm"
                    />
                    <p className="text-sm text-muted-foreground">{t('settings.apiEndpointHelp')}</p>
                    <div className="flex items-center space-x-2 mt-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <p className="text-sm text-muted-foreground">
                        {t('settings.durationWarning')}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {config.asr.provider === 'qwen' ? (
                <div className="space-y-4 border-t border-border pt-6">
                  <h3 className="text-base font-semibold leading-none">
                    {t('settings.qwenAsrCardTitle')}
                  </h3>
                  <Alert className="border-muted-foreground/25 bg-muted/40">
                    <AlertDescription className="text-sm text-muted-foreground">
                      {t('settings.qwenAsrHint')}
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    <Label htmlFor="qwenRegion">{t('settings.qwenDashscopeRegion')}</Label>
                    <Select
                      value={config.asr.qwenRegion ?? 'cn'}
                      onValueChange={(value) =>
                        setConfig((prev) => ({
                          ...prev,
                          asr: {
                            ...prev.asr,
                            qwenRegion: value as 'cn' | 'intl' | 'us',
                            qwenSubmitUrl: '',
                          },
                        }))
                      }
                    >
                      <SelectTrigger id="qwenRegion" className="no-drag w-full cursor-pointer">
                        <SelectValue placeholder={t('settings.languagePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cn">{t('settings.qwenRegionCn')}</SelectItem>
                        <SelectItem value="intl">{t('settings.qwenRegionIntl')}</SelectItem>
                        <SelectItem value="us">{t('settings.qwenRegionUs')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qwenSubmitUrl">{t('settings.qwenSubmitEndpoint')}</Label>
                    <Input
                      id="qwenSubmitUrl"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      value={config.asr.qwenSubmitUrl ?? ''}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          asr: { ...prev.asr, qwenSubmitUrl: e.target.value },
                        }))
                      }
                      placeholder={qwenDefaultMultimodalUrl}
                      className="no-drag font-mono text-sm"
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('settings.qwenSubmitEndpointHelp')}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.qwenModelLabel')}: {qwenShortAsrModelName(config.asr.qwenRegion)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qwenApiKey">{t('settings.qwenApiKey')}</Label>
                    <div className="relative">
                      <Input
                        id="qwenApiKey"
                        type={showQwenApiKey ? 'text' : 'password'}
                        value={config.asr.qwenApiKey ?? ''}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            asr: { ...prev.asr, qwenApiKey: e.target.value },
                          }))
                        }
                        placeholder={t('settings.qwenApiKeyPlaceholder')}
                        className="no-drag pr-10"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground no-drag"
                        onClick={() => setShowQwenApiKey((v) => !v)}
                        aria-label={
                          showQwenApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')
                        }
                        title={showQwenApiKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                      >
                        {showQwenApiKey ? (
                          <EyeOff className="size-4" aria-hidden />
                        ) : (
                          <Eye className="size-4" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">{t('settings.erpnextcnTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('settings.erpnextcnHelp')}</p>
              <Alert className="border-muted-foreground/25 bg-muted/40">
                <AlertDescription className="text-sm text-muted-foreground">
                  {t('settings.storageLinkedToAudioHint')}
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="erpnextcnHost">{t('settings.erpnextcnHost')}</Label>
                <Input
                  id="erpnextcnHost"
                  type="url"
                  value={config.erpnextcnDty.host}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      erpnextcnDty: { ...prev.erpnextcnDty, host: e.target.value },
                    }))
                  }
                  placeholder={ERPNEXTCN_DTY.DEFAULT_HOST}
                  className="no-drag"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="erpnextcnApiKey">{t('settings.erpnextcnApiKey')}</Label>
                <div className="relative">
                  <Input
                    id="erpnextcnApiKey"
                    type={showErpnextcnKey ? 'text' : 'password'}
                    value={config.erpnextcnDty.apiKey}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        erpnextcnDty: { ...prev.erpnextcnDty, apiKey: e.target.value },
                      }))
                    }
                    placeholder={t('settings.erpnextcnApiKeyPlaceholder')}
                    className="no-drag pr-10"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7 text-muted-foreground hover:text-foreground no-drag"
                    onClick={() => setShowErpnextcnKey((v) => !v)}
                    aria-label={
                      showErpnextcnKey ? t('settings.hideApiKey') : t('settings.showApiKey')
                    }
                    title={showErpnextcnKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                  >
                    {showErpnextcnKey ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hotkeys" className="mt-4 space-y-6">
          <HotkeySettings />
        </TabsContent>

        <TabsContent value="about" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">{t('settings.about')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('settings.version', { version: __APP_VERSION__ })}
                  </p>
                  {updateInfo?.hasUpdate && (
                    <p className="text-sm text-chart-2 font-medium">
                      {t('settings.hasUpdate', { version: updateInfo.latestVersion })}
                    </p>
                  )}
                  {updateInfo?.hasUpdate === false && !updateInfo.error && (
                    <p className="text-sm text-muted-foreground">{t('settings.noUpdate')}</p>
                  )}
                  {updateInfo?.error && (
                    <p className="text-sm text-destructive">{t('settings.updateError')}</p>
                  )}
                  {updateInfo?.status === 'downloading' && updateInfo.downloadProgress && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {t('settings.downloadingUpdate', {
                          percent: Math.round(updateInfo.downloadProgress.percent),
                        })}
                      </p>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${updateInfo.downloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {updateInfo?.status === 'downloaded' && (
                    <p className="text-sm text-chart-2 font-medium">
                      {t('settings.updateDownloaded')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {updateInfo?.hasUpdate ? (
                    <>
                      {updateInfo.status === 'downloaded' ? (
                        <Button
                          size="sm"
                          onClick={handleInstallUpdate}
                          disabled={installingUpdate}
                          className="cursor-pointer no-drag"
                        >
                          {installingUpdate
                            ? t('settings.installingUpdate')
                            : t('settings.installUpdate')}
                        </Button>
                      ) : updateInfo.status === 'downloading' ? (
                        <Button size="sm" disabled className="cursor-pointer no-drag">
                          {t('settings.downloadingUpdate', {
                            percent: Math.round(updateInfo.downloadProgress?.percent || 0),
                          })}
                        </Button>
                      ) : !isPackaged ? (
                        // 开发环境下，直接显示"去 GitHub 下载"按钮
                        <Button
                          size="sm"
                          onClick={handleOpenRelease}
                          className="cursor-pointer no-drag"
                        >
                          {t('settings.downloadUpdate')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleDownloadUpdate}
                          disabled={downloadingUpdate}
                          className="cursor-pointer no-drag"
                        >
                          {downloadingUpdate
                            ? t('settings.downloadingUpdate', { percent: 0 })
                            : t('settings.downloadUpdate')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenRelease}
                        className="cursor-pointer no-drag"
                      >
                        {t('settings.openReleasePage')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckUpdate}
                      disabled={checkingUpdate}
                      className="cursor-pointer no-drag"
                    >
                      {checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {testResult && (
        <Alert variant={isSuccess ? 'default' : 'destructive'} className="mt-6">
          {isSuccess ? (
            <CheckCircle2 className="h-4 w-4 text-chart-2" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription className={isSuccess ? 'text-chart-2' : ''}>
            {resultMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 mt-6">
        <Button
          variant="secondary"
          onClick={handleTestConnection}
          disabled={
            testing ||
            (config.asr.provider === 'qwen' ? !config.asr.qwenApiKey?.trim() : !currentApiKey)
          }
          className="no-drag flex-1 cursor-pointer"
        >
          {testing ? t('settings.testingConnection') : t('settings.testConnection')}
        </Button>
        <Button onClick={handleSave} disabled={saving} className="no-drag flex-1 cursor-pointer">
          {saving ? t('settings.savingConfig') : t('settings.saveConfig')}
        </Button>
      </div>
    </div>
  )
}
