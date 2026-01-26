import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
    },
    hotkey: {
      pttKey: '',
      toggleSettings: '',
    },
  })

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const hasLoadedConfig = useRef(false)
  const hasLoadedUpdateStatus = useRef(false)

  useEffect(() => {
    if (hasLoadedConfig.current) return
    hasLoadedConfig.current = true

    const loadConfig = async () => {
      try {
        const loadedConfig = await window.electronAPI.getConfig()
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
    void window.electronAPI.setConfig({ app: { language: setting } }).catch((error) => {
      // eslint-disable-next-line no-console -- report persist failure
      console.error('Failed to persist app language:', error)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      const latestConfig = await window.electronAPI.getConfig()

      await window.electronAPI.setConfig({
        ...latestConfig,
        app: config.app,
        asr: config.asr,
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
    // Validate key for current region
    const region = config.asr.region || 'cn'
    const apiKey = config.asr.apiKeys[region]

    if (!apiKey) {
      setTestResult({ type: 'error', message: t('settings.result.apiKeyRequired') })
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
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

  // Update Logic
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isPackaged, setIsPackaged] = useState(true)

  useEffect(() => {
    if (hasLoadedUpdateStatus.current) return
    hasLoadedUpdateStatus.current = true

    const loadUpdateStatus = async () => {
      try {
        const info = await window.electronAPI.getUpdateStatus()
        if (info) {
          setUpdateInfo(info)
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- report update status load failure
        console.error('Failed to load update status:', error)
      }
    }

    loadUpdateStatus()

    // 检查是否是打包版本
    window.electronAPI
      .getIsPackaged()
      .then(setIsPackaged)
      .catch(() => setIsPackaged(true))

    // 监听更新事件
    const unsubscribeProgress = window.electronAPI.onUpdateDownloadProgress((progress) => {
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

    const unsubscribeAvailable = window.electronAPI.onUpdateAvailable((event, data) => {
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
    if (updateInfo?.releaseUrl) {
      window.electronAPI.openExternal(updateInfo.releaseUrl)
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="h-8 bg-muted/50 p-0.5 rounded-md">
          <TabsTrigger
            value="general"
            className="px-3 py-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {t('settings.appPreferences')}
          </TabsTrigger>
          <TabsTrigger
            value="asr"
            className="px-3 py-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {t('settings.asrConfig')}
          </TabsTrigger>
          <TabsTrigger
            value="hotkeys"
            className="px-3 py-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {t('hotkey.title')}
          </TabsTrigger>
          <TabsTrigger
            value="about"
            className="px-3 py-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            {t('settings.about')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asr" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-bold">{t('settings.asrConfig')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Input
                  id="apiKey"
                  type="password"
                  value={currentApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={t('settings.apiKeyPlaceholder')}
                  className="no-drag"
                />
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
                  type="text"
                  value={
                    config.asr.endpoint ||
                    (currentRegion === 'intl'
                      ? 'https://api.z.ai/api/paas/v4/audio/transcriptions'
                      : 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions')
                  }
                  readOnly
                  disabled
                  className="no-drag bg-muted text-muted-foreground"
                />
                <div className="flex items-center space-x-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <p className="text-sm text-muted-foreground">{t('settings.durationWarning')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hotkeys" className="space-y-6 mt-6">
          <HotkeySettings />
        </TabsContent>

        <TabsContent value="about" className="space-y-6 mt-6">
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
          disabled={testing || !currentApiKey}
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
