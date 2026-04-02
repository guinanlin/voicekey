import Store from 'electron-store'
import {
  AppConfig,
  AppPreferences,
  ASRConfig,
  ErpnextcnDtyConfig,
  HotkeyConfig,
} from '../shared/types'
import { DEFAULT_HOTKEYS, ERPNEXTCN_DTY } from '../shared/constants'

// 配置Schema
interface ConfigSchema {
  app: AppPreferences
  asr: ASRConfig
  hotkey: HotkeyConfig
  erpnextcnDty: ErpnextcnDtyConfig
}

// 默认配置
const defaultConfig: AppConfig = {
  app: {
    language: 'system',
    autoLaunch: false,
  },
  asr: {
    provider: 'glm',
    region: 'cn',
    apiKeys: {
      cn: '',
      intl: '',
    },
    // apiKey: '',  // Deprecated, removed from default
    endpoint: '',
    language: 'auto',
    qwenApiKey: '',
    qwenRegion: 'cn',
  },
  hotkey: {
    pttKey: DEFAULT_HOTKEYS.PTT,
    toggleSettings: DEFAULT_HOTKEYS.SETTINGS,
  },
  erpnextcnDty: {
    host: '',
    apiKey: '',
  },
}

// 配置管理器
export class ConfigManager {
  private store: Store<ConfigSchema>

  constructor() {
    this.store = new Store<ConfigSchema>({
      defaults: defaultConfig,
      name: 'voice-key-config',
    })
    this.migrate()
  }

  // 迁移旧配置
  private migrate(): void {
    // 检查是否有旧的 apiKey，如果有且 cn key 为空，则迁移
    // 使用 any 绕过类型检查，因为 we want to check raw store content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asrConfig = this.store.get('asr') as any
    if (asrConfig && asrConfig.apiKey) {
      const currentApiKeys = this.store.get('asr.apiKeys', { cn: '', intl: '' })
      if (!currentApiKeys.cn) {
        this.store.set('asr.apiKeys.cn', asrConfig.apiKey)
        // 旧字段路径，Store 类型不包含 deprecated 键
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.store.delete('asr.apiKey' as any)
      }
    }
    const raw = this.store.get('asr') as ASRConfig
    if (raw && raw.provider !== 'glm' && raw.provider !== 'qwen') {
      this.store.set('asr.provider', 'glm')
    }
    if (raw && (raw.qwenRegion === undefined || raw.qwenRegion === null)) {
      this.store.set('asr.qwenRegion', 'cn')
    }
    if (raw && raw.qwenApiKey === undefined) {
      this.store.set('asr.qwenApiKey', '')
    }
  }

  // 获取完整配置
  getConfig(): AppConfig {
    return {
      app: this.getAppConfig(),
      asr: this.getASRConfig(),
      hotkey: this.getHotkeyConfig(),
      erpnextcnDty: this.getErpnextcnDtyFromStore(),
    }
  }

  // 获取 App 配置
  getAppConfig(): AppPreferences {
    return this.store.get('app', defaultConfig.app)
  }

  // 设置 App 配置
  setAppConfig(config: Partial<AppPreferences>): void {
    const current = this.getAppConfig()
    this.store.set('app', { ...current, ...config })
  }

  // 获取ASR配置
  getASRConfig(): ASRConfig {
    const config = this.store.get('asr', defaultConfig.asr)
    // 确保 apiKeys 存在 (防止旧的部分配置覆盖)
    if (!config.apiKeys) {
      config.apiKeys = { cn: '', intl: '' }
    }
    // 确保 region 存在
    if (!config.region) {
      config.region = 'cn'
    }
    if (config.provider !== 'glm' && config.provider !== 'qwen') {
      return { ...config, provider: 'glm' }
    }
    return {
      ...config,
      qwenApiKey: config.qwenApiKey ?? '',
      qwenRegion: config.qwenRegion === 'intl' ? 'intl' : 'cn',
    }
  }

  // 设置ASR配置
  setASRConfig(config: Partial<ASRConfig>): void {
    const current = this.getASRConfig()
    this.store.set('asr', { ...current, ...config })
  }

  // 获取快捷键配置
  getHotkeyConfig(): HotkeyConfig {
    return this.store.get('hotkey', defaultConfig.hotkey)
  }

  // 设置快捷键配置
  setHotkeyConfig(config: Partial<HotkeyConfig>): void {
    const current = this.getHotkeyConfig()
    this.store.set('hotkey', { ...current, ...config })
  }

  /** 界面与 IPC 使用：持久化中的原始值（host 为空表示使用内置默认服务地址） */
  getErpnextcnDtyFromStore(): ErpnextcnDtyConfig {
    return this.store.get('erpnextcnDty', defaultConfig.erpnextcnDty)
  }

  /** 上传前解析：host 为空时回退到 ERPNEXTCN_DTY.DEFAULT_HOST */
  getErpnextcnDtyResolvedForUpload(): ErpnextcnDtyConfig {
    const stored = this.getErpnextcnDtyFromStore()
    return {
      host: (stored.host?.trim() || ERPNEXTCN_DTY.DEFAULT_HOST).replace(/\/$/, ''),
      apiKey: stored.apiKey?.trim() || '',
    }
  }

  setErpnextcnDtyConfig(config: Partial<ErpnextcnDtyConfig>): void {
    const current = this.store.get('erpnextcnDty', defaultConfig.erpnextcnDty)
    this.store.set('erpnextcnDty', { ...current, ...config })
  }

  // 重置为默认配置
  reset(): void {
    this.store.clear()
  }

  // 检查配置是否有效
  isValid(): boolean {
    const asr = this.getASRConfig()
    if (asr.provider === 'qwen') {
      return !!asr.qwenApiKey?.trim()
    }
    const region = asr.region || 'cn'
    const key = asr.apiKeys?.[region]
    return !!key && key.length > 0
  }
}

// 导出单例
export const configManager = new ConfigManager()
