import { ElectronAPI } from '../electron/preload/preload'

declare global {
  interface Window {
    /** 仅 Electron 预加载脚本注入；纯浏览器访问 dev/preview 时不存在 */
    electronAPI?: ElectronAPI
  }
}

export {}
