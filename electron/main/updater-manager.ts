import { app, shell } from 'electron'
import axios from 'axios'
import semver from 'semver'
import type { UpdateInfo } from '../shared/types'

const GITHUB_REPO_OWNER = 'guinanlin'
const GITHUB_REPO_NAME = 'voicekey'

export class UpdaterManager {
  private static lastUpdateInfo: UpdateInfo | null = null

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
    try {
      // 这里的 URL 针对 Public 仓库。Private 仓库会 404。
      const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`

      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Voice-Key-App',
        },
      })

      const latestRelease = response.data
      const latestTag = String(latestRelease.tag_name ?? '')
      const currentVersion = app.getVersion()
      const latestCoerced = semver.coerce(latestTag)
      const currentCoerced = semver.coerce(currentVersion)

      if (!latestCoerced || !currentCoerced) {
        const info: UpdateInfo = {
          hasUpdate: false,
          latestVersion: latestTag,
          releaseUrl: UpdaterManager.sanitizeReleaseUrl(latestRelease.html_url),
          releaseNotes: latestRelease.body ?? '',
          error: 'Invalid version tag from release or app version',
        }
        UpdaterManager.lastUpdateInfo = info
        return info
      }

      const hasUpdate = semver.gt(latestCoerced, currentCoerced)

      const info: UpdateInfo = {
        hasUpdate,
        latestVersion: latestCoerced.version,
        releaseUrl: UpdaterManager.sanitizeReleaseUrl(latestRelease.html_url),
        releaseNotes: latestRelease.body ?? '',
      }
      UpdaterManager.lastUpdateInfo = info
      return info
    } catch (error) {
      console.error('Failed to check for updates:', error)
      // 如果是 404，可能是私有仓库，无法通过 API 检查
      const info: UpdateInfo = {
        hasUpdate: false,
        latestVersion: '',
        releaseUrl: UpdaterManager.getDefaultReleaseUrl(),
        releaseNotes: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      UpdaterManager.lastUpdateInfo = info
      return info
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
