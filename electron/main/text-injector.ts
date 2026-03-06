import { execFile } from 'child_process'
import { promisify } from 'util'
import { clipboard, type NativeImage } from 'electron'
import { keyboard, Key } from '@nut-tree-fork/nut-js'

const execFileAsync = promisify(execFile)

type ClipboardSnapshot = {
  text?: string
  html?: string
  rtf?: string
  image?: NativeImage
}

export class TextInjector {
  constructor() {
    keyboard.config.autoDelayMs = 0
  }

  async injectText(text: string): Promise<void> {
    const injectStartTime = Date.now()
    if (!text || text.trim().length === 0) {
      console.warn('[TextInjector] Empty text, skipping injection')
      return
    }

    try {
      console.log('[TextInjector] Text to inject:', text)
      console.log('[TextInjector] Text bytes:', Buffer.from(text).toString('hex'))
      console.log('[TextInjector] Text length:', text.length)

      const delayStartTime = Date.now()
      await this.delay(100)
      const delayDuration = Date.now() - delayStartTime
      console.log(`[TextInjector] ⏱️  Pre-injection delay took ${delayDuration}ms`)

      const typingStartTime = Date.now()
      console.log(`[TextInjector] [${new Date().toISOString()}] Starting text injection...`)
      await this.typeTextInternal(text)
      const typingDuration = Date.now() - typingStartTime
      console.log(`[TextInjector] [${new Date().toISOString()}] Text injection completed`)
      console.log(`[TextInjector] ⏱️  Keyboard typing took ${typingDuration}ms`)

      const totalDuration = Date.now() - injectStartTime
      console.log(`[TextInjector] ⏱️  Total injectText() took ${totalDuration}ms`)
      console.log('[TextInjector] Text injected successfully')
    } catch (error) {
      const errorDuration = Date.now() - injectStartTime
      console.error(`[TextInjector] Failed to inject text after ${errorDuration}ms:`, error)
      throw new Error(
        `Text injection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  // 检查是否有必要的权限（主要针对macOS）
  async checkPermissions(): Promise<{ hasPermission: boolean; message?: string }> {
    if (process.platform === 'darwin') {
      // macOS需要辅助功能权限
      // nut.js会在第一次使用时自动请求权限
      try {
        // 尝试一个简单的操作来检查权限
        await keyboard.type('')
        return { hasPermission: true }
      } catch (error) {
        console.log({ error })
        return {
          hasPermission: false,
          message:
            'macOS requires Accessibility permissions. Please go to System Preferences > Security & Privacy > Privacy > Accessibility and enable Voice Key.',
        }
      }
    }

    // Windows和Linux通常不需要特殊权限
    return { hasPermission: true }
  }

  // 模拟按键（用于特殊按键，如Enter、Tab等）
  async pressKey(key: Key): Promise<void> {
    try {
      await keyboard.pressKey(key)
      await keyboard.releaseKey(key)
    } catch (error) {
      console.error('Failed to press key:', error)
      throw error
    }
  }

  /**
   * 内部实现：实际执行键盘输入/剪贴板粘贴
   *
   * Windows/Linux：使用剪贴板粘贴 (Ctrl+V)。
   * - keyboard.type() 模拟原始按键，不经过 IME，中文等 Unicode 会乱码。
   * - 剪贴板写入 UTF-8 文本再粘贴，可正确注入多语言内容。
   * - Linux 注意：nut-js 依赖 X11 的键盘模拟；Wayland 下可能无法把按键送到目标窗口，
   *   若注入无效可尝试在 X11 会话下运行，或使用「仅复制到剪贴板」再手动粘贴。
   * macOS：沿用 keyboard.type()（若遇中文乱码可后续改为剪贴板）。
   */
  private async typeTextInternal(text: string): Promise<void> {
    if (process.platform === 'win32' || process.platform === 'linux') {
      await this.pasteFromClipboard(text)
      return
    }
    await keyboard.type(text)
  }

  private captureClipboard(): ClipboardSnapshot {
    const formats = clipboard.availableFormats()
    const snapshot: ClipboardSnapshot = {}

    if (formats.includes('text/plain')) {
      snapshot.text = clipboard.readText()
    }
    if (formats.includes('text/html')) {
      snapshot.html = clipboard.readHTML()
    }
    if (formats.includes('text/rtf')) {
      snapshot.rtf = clipboard.readRTF()
    }
    if (formats.some((format) => format.startsWith('image/'))) {
      const image = clipboard.readImage()
      if (!image.isEmpty()) {
        snapshot.image = image
      }
    }

    return snapshot
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): void {
    const data: Electron.Data = {}
    if (snapshot.text !== undefined) {
      data.text = snapshot.text
    }
    if (snapshot.html !== undefined) {
      data.html = snapshot.html
    }
    if (snapshot.rtf !== undefined) {
      data.rtf = snapshot.rtf
    }
    if (snapshot.image && !snapshot.image.isEmpty()) {
      data.image = snapshot.image
    }

    if (Object.keys(data).length === 0) {
      console.warn('[TextInjector] Clipboard restore skipped: no standard formats captured')
      return
    }

    clipboard.write(data)
  }

  /**
   * 使用 xdotool 发送粘贴（Linux/X11 专用）
   * --clearmodifiers 在发键前强制清除所有持有的修饰键状态
   * （解决右 Ctrl/右 Alt 等修饰键松开后 X11 状态残留导致 Ctrl+V 失效的问题）
   */
  private async tryXdotoolPaste(): Promise<boolean> {
    try {
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { timeout: 2000 })
      console.log('[TextInjector] xdotool paste succeeded')
      return true
    } catch (err) {
      console.warn(
        '[TextInjector] xdotool not available or failed:',
        err instanceof Error ? err.message : err,
      )
      return false
    }
  }

  private async pasteFromClipboard(text: string): Promise<void> {
    const snapshot = this.captureClipboard()
    try {
      if (process.platform === 'win32') {
        console.log('[TextInjector] Writing to clipboard (Windows):', {
          textLength: text.length,
          firstChars: text.substring(0, 20),
          textBytes: Buffer.from(text, 'utf8').toString('hex').substring(0, 40),
        })
      }
      clipboard.writeText(text)
      await this.delay(100)

      if (process.platform === 'linux') {
        // Linux/X11: 优先用 xdotool --clearmodifiers，消除修饰键残留状态
        const ok = await this.tryXdotoolPaste()
        if (ok) {
          await this.delay(50)
          return
        }
        // xdotool 不可用，回退到 nut-js
        console.log('[TextInjector] Falling back to nut-js for paste')
      }

      await keyboard.pressKey(Key.LeftControl, Key.V)
      await keyboard.releaseKey(Key.LeftControl, Key.V)
      await this.delay(50)
    } finally {
      this.restoreClipboard(snapshot)
    }
  }

  // 延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // 字符串到 Key 映射
  private stringToKey(keyName: string): Key | Key[] | null {
    const lower = keyName.toLowerCase().trim()

    // 组合键
    if (lower === 'ctrl_enter') {
      return [Key.LeftControl, Key.Enter]
    }

    // 基础按键映射
    const keyMap: Record<string, Key> = {
      enter: Key.Enter,
      tab: Key.Tab,
      backspace: Key.Backspace,
      esc: Key.Escape,
      escape: Key.Escape,
      space: Key.Space,
      up: Key.Up,
      down: Key.Down,
      left: Key.Left,
      right: Key.Right,
      home: Key.Home,
      end: Key.End,
      pageup: Key.PageUp,
      pagedown: Key.PageDown,
      delete: Key.Delete,
      insert: Key.Insert,
    }

    return keyMap[lower] || null
  }

  // 文本输入（支持模式和后置按键）
  async typeText(
    text: string,
    mode: 'type' | 'clipboard' = 'type',
    afterKey?: string,
  ): Promise<{ success: boolean; message?: string; error?: string; code?: string }> {
    // 参数验证
    if (mode === 'type' && (!text || !text.trim())) {
      return {
        success: false,
        error: '文本内容不能为空',
        code: 'INVALID_PARAMETER',
      }
    }

    if (mode !== 'type' && mode !== 'clipboard') {
      return {
        success: false,
        error: `无效的输入模式: ${mode}`,
        code: 'INVALID_PARAMETER',
      }
    }

    try {
      if (mode === 'clipboard') {
        // 仅同步到剪贴板
        clipboard.writeText(text)
        return {
          success: true,
          message: '文本已复制到剪贴板',
        }
      }

      // type 模式：需要权限检查
      const permission = await this.checkPermissions()
      if (!permission.hasPermission) {
        return {
          success: false,
          error: permission.message || '需要权限才能模拟键盘输入',
          code: 'PERMISSION_DENIED',
        }
      }

      // 执行文本输入
      await this.injectText(text)

      // 如果有后置按键，执行按键操作
      if (afterKey) {
        const key = this.stringToKey(afterKey)
        if (key) {
          await this.delay(50) // 等待输入完成
          if (Array.isArray(key)) {
            await keyboard.pressKey(...key)
            await keyboard.releaseKey(...key)
          } else {
            await this.pressKey(key)
          }
        } else {
          console.warn(`[TextInjector] Unknown afterKey: ${afterKey}`)
        }
      }

      return {
        success: true,
        message: '文本输入成功',
      }
    } catch (error) {
      console.error('[TextInjector] typeText failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '操作失败',
        code: 'SYSTEM_ERROR',
      }
    }
  }

  // 按键模拟（字符串版本）
  async pressKeyFromString(
    keyName: string,
  ): Promise<{ success: boolean; message?: string; error?: string; code?: string }> {
    if (!keyName || !keyName.trim()) {
      return {
        success: false,
        error: '按键名称不能为空',
        code: 'INVALID_PARAMETER',
      }
    }

    // 检查权限
    const permission = await this.checkPermissions()
    if (!permission.hasPermission) {
      return {
        success: false,
        error: permission.message || '需要权限才能模拟键盘输入',
        code: 'PERMISSION_DENIED',
      }
    }

    try {
      const key = this.stringToKey(keyName)
      if (!key) {
        return {
          success: false,
          error: `不支持的按键: ${keyName}`,
          code: 'INVALID_PARAMETER',
        }
      }

      if (Array.isArray(key)) {
        await keyboard.pressKey(...key)
        await keyboard.releaseKey(...key)
      } else {
        await this.pressKey(key)
      }

      return {
        success: true,
        message: `按键 ${keyName} 模拟成功`,
      }
    } catch (error) {
      console.error('[TextInjector] pressKeyFromString failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '操作失败',
        code: 'SYSTEM_ERROR',
      }
    }
  }

  // 服务状态
  getStatus(): {
    status: 'ready' | 'warning' | 'error' | 'disabled'
    message: string
    permission: boolean
  } {
    // 检查平台支持
    const platformSupported = ['win32', 'darwin', 'linux'].includes(process.platform)

    if (!platformSupported) {
      return {
        status: 'error',
        message: `当前系统不支持剪贴板功能: ${process.platform}`,
        permission: false,
      }
    }

    // 检查依赖可用性（nut-js）
    let dependenciesAvailable = false
    try {
      // 尝试访问 keyboard 对象，如果成功则依赖可用
      dependenciesAvailable = keyboard !== undefined
    } catch {
      dependenciesAvailable = false
    }

    if (!dependenciesAvailable) {
      return {
        status: 'error',
        message: '缺少必要的依赖库: @nut-tree-fork/nut-js',
        permission: false,
      }
    }

    // 检查权限（异步检查，这里返回警告状态）
    // 实际权限检查在 checkPermissionsExtended 中
    return {
      status: 'ready',
      message: '剪贴板服务就绪',
      permission: true, // 这里假设有权限，实际权限在 checkPermissionsExtended 中检查
    }
  }

  // 扩展权限检查
  async checkPermissionsExtended(): Promise<{
    has_permission: boolean
    platform_supported: boolean
    dependencies_available: boolean
    message: string
  }> {
    const platformSupported = ['win32', 'darwin', 'linux'].includes(process.platform)

    let dependenciesAvailable = false
    try {
      dependenciesAvailable = keyboard !== undefined
    } catch {
      dependenciesAvailable = false
    }

    const permission = await this.checkPermissions()

    let message = ''
    if (!platformSupported) {
      message = `当前系统不支持: ${process.platform}`
    } else if (!dependenciesAvailable) {
      message = '缺少必要的依赖库: @nut-tree-fork/nut-js'
    } else if (permission.hasPermission) {
      message = '权限正常'
    } else {
      message = permission.message || '需要权限才能使用键盘模拟功能'
    }

    return {
      has_permission: permission.hasPermission,
      platform_supported: platformSupported,
      dependencies_available: dependenciesAvailable,
      message,
    }
  }
}

const injectorInstance = new TextInjector()
export const textInjector = injectorInstance
