import { app, shell, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import axios from 'axios'
import semver from 'semver'
import { IPC_CHANNELS, type UpdateInfo } from '../shared/types'

const GITHUB_REPO_OWNER = 'guinanlin'
const GITHUB_REPO_NAME = 'voicekey'

export class UpdaterManager {
  private static lastUpdateInfo: UpdateInfo | null = null
  private static downloadProgress: { percent: number; transferred: number; total: number } | null =
    null
  private static mainWindow: BrowserWindow | null = null
  private static settingsWindow: BrowserWindow | null = null

  static initialize(mainWindow: BrowserWindow) {
    UpdaterManager.mainWindow = mainWindow

    // 配置 autoUpdater
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
    })

    // 禁用自动下载，由用户手动触发
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    // 监听更新检查结果
    autoUpdater.on('checking-for-update', () => {
      console.log('[Updater] Checking for updates...')
      UpdaterManager.updateLastInfo({ status: 'checking' })
      UpdaterManager.sendUpdateEvent('checking')
    })

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Update available:', info.version)
      const releaseNotes =
        typeof info.releaseNotes === 'string'
          ? info.releaseNotes
          : Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map((n) => (typeof n === 'string' ? n : n.note || '')).join('\n')
            : ''
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        latestVersion: info.version,
        releaseUrl: `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tag/v${info.version}`,
        releaseNotes,
        status: 'available',
      }
      UpdaterManager.lastUpdateInfo = updateInfo
      UpdaterManager.sendUpdateEvent('available', updateInfo)
    })

    autoUpdater.on('update-not-available', (info) => {
      console.log('[Updater] Update not available. Current version:', info.version)
      const updateInfo: UpdateInfo = {
        hasUpdate: false,
        latestVersion: info.version || app.getVersion(),
        releaseUrl: UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: '',
        status: 'not-available',
      }
      UpdaterManager.lastUpdateInfo = updateInfo
      UpdaterManager.sendUpdateEvent('not-available', updateInfo)
    })

    // 监听下载进度
    autoUpdater.on('download-progress', (progress) => {
      console.log('[Updater] Download progress:', progress.percent)
      UpdaterManager.downloadProgress = {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      }
      UpdaterManager.updateLastInfo({
        status: 'downloading',
        downloadProgress: UpdaterManager.downloadProgress,
      })
      UpdaterManager.sendDownloadProgress(progress.percent, progress.transferred, progress.total)
    })

    // 监听下载完成
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Update downloaded:', info.version)
      UpdaterManager.updateLastInfo({ status: 'downloaded' })
      UpdaterManager.sendUpdateEvent('downloaded', {
        hasUpdate: true,
        latestVersion: info.version,
        releaseUrl: UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: '',
        status: 'downloaded',
      })
    })

    // 监听错误
    autoUpdater.on('error', (error) => {
      console.error('[Updater] Error:', error)
      const updateInfo: UpdateInfo = {
        hasUpdate: false,
        latestVersion: '',
        releaseUrl: UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: '',
        error: error.message,
        status: 'error',
      }
      UpdaterManager.lastUpdateInfo = updateInfo
      UpdaterManager.sendUpdateEvent('error', updateInfo)
    })
  }

  static setSettingsWindow(window: BrowserWindow | null) {
    UpdaterManager.settingsWindow = window
  }

  private static updateLastInfo(partial: Partial<UpdateInfo>) {
    if (UpdaterManager.lastUpdateInfo) {
      UpdaterManager.lastUpdateInfo = {
        ...UpdaterManager.lastUpdateInfo,
        ...partial,
      }
    }
  }

  private static sendUpdateEvent(event: string, data?: UpdateInfo) {
    const updateData = data || UpdaterManager.lastUpdateInfo
    if (UpdaterManager.mainWindow && !UpdaterManager.mainWindow.isDestroyed()) {
      UpdaterManager.mainWindow.webContents.send(
        IPC_CHANNELS.ON_UPDATE_AVAILABLE,
        event,
        updateData,
      )
    }
    if (UpdaterManager.settingsWindow && !UpdaterManager.settingsWindow.isDestroyed()) {
      UpdaterManager.settingsWindow.webContents.send(
        IPC_CHANNELS.ON_UPDATE_AVAILABLE,
        event,
        updateData,
      )
    }
  }

  private static sendDownloadProgress(percent: number, transferred: number, total: number) {
    const progress = { percent, transferred, total }
    if (UpdaterManager.mainWindow && !UpdaterManager.mainWindow.isDestroyed()) {
      UpdaterManager.mainWindow.webContents.send(IPC_CHANNELS.ON_UPDATE_DOWNLOAD_PROGRESS, progress)
    }
    if (UpdaterManager.settingsWindow && !UpdaterManager.settingsWindow.isDestroyed()) {
      UpdaterManager.settingsWindow.webContents.send(
        IPC_CHANNELS.ON_UPDATE_DOWNLOAD_PROGRESS,
        progress,
      )
    }
  }

  private static getDefaultReleaseUrl() {
    return `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`
  }

  private static sanitizeReleaseUrl(url?: string) {
    if (!url) return UpdaterManager.getDefaultReleaseUrl()
    try {
      const parsed = new URL(url)
      const allowedPath = `/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`
      if (parsed.protocol !== 'https:') return UpdaterManager.getDefaultReleaseUrl()
      if (parsed.hostname !== 'github.com') return UpdaterManager.getDefaultReleaseUrl()
      if (!parsed.pathname.startsWith(allowedPath)) return UpdaterManager.getDefaultReleaseUrl()
      return parsed.toString()
    } catch {
      return UpdaterManager.getDefaultReleaseUrl()
    }
  }

  static async checkForUpdates(): Promise<UpdateInfo> {
    // 在开发环境下，electron-updater 无法正常工作，直接使用 GitHub API
    if (!app.isPackaged) {
      console.log('[Updater] Development mode detected, using GitHub API for update check')
      return await UpdaterManager.checkForUpdatesViaAPI()
    }

    try {
      console.log('[Updater] Checking for updates using electron-updater...')
      console.log('[Updater] Current version:', app.getVersion())

      // 使用 electron-updater 检查更新
      const result = await autoUpdater.checkForUpdates()
      console.log('[Updater] Check result:', result)

      // 等待一小段时间，让事件处理器有机会更新 lastUpdateInfo
      await new Promise((resolve) => setTimeout(resolve, 500))

      // 返回当前状态
      if (UpdaterManager.lastUpdateInfo) {
        console.log('[Updater] Update info from event:', UpdaterManager.lastUpdateInfo)
        return UpdaterManager.lastUpdateInfo
      }

      // 如果没有收到事件，回退到 GitHub API
      console.log('[Updater] No update event received, falling back to GitHub API')
      return await UpdaterManager.checkForUpdatesViaAPI()
    } catch (error) {
      console.error('[Updater] electron-updater failed:', error)
      // 如果 electron-updater 失败，回退到 GitHub API
      return await UpdaterManager.checkForUpdatesViaAPI()
    }
  }

  // 备用方法：通过 GitHub API 检查更新
  private static async checkForUpdatesViaAPI(): Promise<UpdateInfo> {
    try {
      const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`
      console.log('[Updater] Checking GitHub API:', url)

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Voice-Key-App',
        },
      })

      const latestRelease = response.data
      const latestTag = String(latestRelease.tag_name ?? '')
      const currentVersion = app.getVersion()

      console.log('[Updater] Latest tag from GitHub:', latestTag)
      console.log('[Updater] Current app version:', currentVersion)

      // 处理版本号格式（可能包含 'v' 前缀）
      const latestTagClean = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag
      const latestCoerced = semver.coerce(latestTagClean)
      const currentCoerced = semver.coerce(currentVersion)

      if (!latestCoerced || !currentCoerced) {
        console.error('[Updater] Version parsing failed:', {
          latestTag,
          latestTagClean,
          latestCoerced: latestCoerced?.version,
          currentVersion,
          currentCoerced: currentCoerced?.version,
        })
        const info: UpdateInfo = {
          hasUpdate: false,
          latestVersion: latestTag,
          releaseUrl: UpdaterManager.sanitizeReleaseUrl(latestRelease.html_url),
          releaseNotes: latestRelease.body ?? '',
          error: 'Invalid version tag from release or app version',
          status: 'error',
        }
        UpdaterManager.lastUpdateInfo = info
        return info
      }

      const hasUpdate = semver.gt(latestCoerced, currentCoerced)
      console.log('[Updater] Version comparison:', {
        latest: latestCoerced.version,
        current: currentCoerced.version,
        hasUpdate,
      })

      const info: UpdateInfo = {
        hasUpdate,
        latestVersion: latestCoerced.version,
        releaseUrl: UpdaterManager.sanitizeReleaseUrl(latestRelease.html_url),
        releaseNotes: latestRelease.body ?? '',
        status: hasUpdate ? 'available' : 'not-available',
      }
      UpdaterManager.lastUpdateInfo = info
      return info
    } catch (error) {
      console.error('Failed to check for updates via API:', error)
      const info: UpdateInfo = {
        hasUpdate: false,
        latestVersion: '',
        releaseUrl: UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
      }
      UpdaterManager.lastUpdateInfo = info
      return info
    }
  }

  static async downloadUpdate(): Promise<void> {
    // 在开发环境下，electron-updater 无法下载，需要用户手动下载
    if (!app.isPackaged) {
      const error = new Error(
        'Auto-download is not available in development mode. Please download manually from GitHub.',
      )
      console.error('[Updater] Download failed:', error.message)
      const updateInfo: UpdateInfo = {
        hasUpdate: true,
        latestVersion: UpdaterManager.lastUpdateInfo?.latestVersion || '',
        releaseUrl:
          UpdaterManager.lastUpdateInfo?.releaseUrl || UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: UpdaterManager.lastUpdateInfo?.releaseNotes || '',
        error: error.message,
        status: 'error',
      }
      UpdaterManager.lastUpdateInfo = updateInfo
      throw error
    }

    try {
      console.log('[Updater] Starting download...')

      // 确保已经检查过更新
      if (!UpdaterManager.lastUpdateInfo?.hasUpdate) {
        console.log('[Updater] No update info available, checking first...')
        await UpdaterManager.checkForUpdates()

        // 再次检查
        if (!UpdaterManager.lastUpdateInfo?.hasUpdate) {
          throw new Error('No update available to download')
        }
      }

      await autoUpdater.downloadUpdate()
    } catch (error) {
      console.error('[Updater] Download failed:', error)
      const updateInfo: UpdateInfo = {
        hasUpdate: UpdaterManager.lastUpdateInfo?.hasUpdate || false,
        latestVersion: UpdaterManager.lastUpdateInfo?.latestVersion || '',
        releaseUrl:
          UpdaterManager.lastUpdateInfo?.releaseUrl || UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: UpdaterManager.lastUpdateInfo?.releaseNotes || '',
        error: error instanceof Error ? error.message : 'Download failed',
        status: 'error',
      }
      UpdaterManager.lastUpdateInfo = updateInfo
      throw error
    }
  }

  static async installUpdate(): Promise<void> {
    try {
      console.log('[Updater] Installing update...')
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      console.error('[Updater] Install failed:', error)
      throw error
    }
  }

  static getLastUpdateInfo() {
    return UpdaterManager.lastUpdateInfo
  }

  static openReleasePage(url?: string) {
    const targetUrl = UpdaterManager.sanitizeReleaseUrl(url)
    shell.openExternal(targetUrl)
  }
}
