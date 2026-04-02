import { execFile } from 'child_process'
import { promisify } from 'util'
import { clipboard } from 'electron'
import { keyboard, Key } from '@nut-tree-fork/nut-js'

const execFileAsync = promisify(execFile)

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
      await this.delay(100)
      await this.typeTextInternal(text)
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
   * Windows/Linux：`clipboard.writeText` 后模拟 Ctrl+V；注入结束后系统剪贴板保留为本次文本，不恢复注入前内容。
   * - 若用 keyboard.type() 模拟原始按键，不经过 IME，中文等 Unicode 会乱码，故 Win/Linux 走剪贴板。
   * - Linux：nut-js 依赖 X11 的键盘模拟；Wayland 下可能无法把按键送到目标窗口，
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

  /**
   * 使用 xdotool 发送粘贴（Linux/X11 专用）
   * --clearmodifiers 在发键前强制清除所有持有的修饰键状态
   * （解决右 Ctrl/右 Alt 等修饰键松开后 X11 状态残留导致 Ctrl+V 失效的问题）
   */
  private async tryXdotoolPaste(): Promise<boolean> {
    try {
      await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { timeout: 2000 })
      return true
    } catch (err) {
      console.warn(
        '[TextInjector] xdotool not available or failed:',
        err instanceof Error ? err.message : err,
      )
      return false
    }
  }

  /**
   * Linux/X11：`after_key` 与粘贴同源走 xdotool，避免 nut-js 按键送不到前台窗口而粘贴已成功的情况。
   */
  private async tryXdotoolAfterKey(afterKey: string): Promise<boolean> {
    const lower = afterKey.toLowerCase().trim()
    let spec: string | null = null
    if (lower === 'ctrl_enter') {
      spec = 'ctrl+Return'
    } else {
      const map: Record<string, string> = {
        enter: 'Return',
        tab: 'Tab',
        backspace: 'BackSpace',
        esc: 'Escape',
        escape: 'Escape',
        space: 'space',
        up: 'Up',
        down: 'Down',
        left: 'Left',
        right: 'Right',
        home: 'Home',
        end: 'End',
        pageup: 'Page_Up',
        pagedown: 'Page_Down',
        delete: 'Delete',
        insert: 'Insert',
      }
      spec = map[lower] ?? null
    }
    if (!spec) {
      return false
    }
    try {
      // 粘贴后部分应用尚未处理完 Ctrl+V，立即发 Return 会丢键；用 xdotool 内建 sleep 再发键，避免与 injectText 的时序竞态
      const needsPasteSettle = spec === 'Return' || spec === 'ctrl+Return'
      const xdotoolArgs = needsPasteSettle
        ? (['sleep', '0.18', 'key', '--clearmodifiers', spec] as const)
        : (['key', '--clearmodifiers', spec] as const)
      await execFileAsync('xdotool', [...xdotoolArgs], { timeout: needsPasteSettle ? 4000 : 2000 })
      return true
    } catch (err) {
      console.warn(
        '[TextInjector] xdotool after_key failed:',
        err instanceof Error ? err.message : err,
      )
      return false
    }
  }

  /**
   * Win/Linux：写入剪贴板并粘贴；不快照、不恢复，完成后剪贴板即为本次文本。
   */
  private async pasteFromClipboard(text: string): Promise<void> {
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
          // Linux：剪贴板粘贴后多等一帧，减少与 xdotool after_key 的竞态（去掉调试埋点后仅 50ms 时易复现）
          const preKeyMs = process.platform === 'linux' ? 120 : 50
          await this.delay(preKeyMs)
          let usedXdotoolAfterKey = false
          if (process.platform === 'linux') {
            usedXdotoolAfterKey = await this.tryXdotoolAfterKey(afterKey)
          }
          if (!usedXdotoolAfterKey) {
            if (Array.isArray(key)) {
              await keyboard.pressKey(...key)
              await keyboard.releaseKey(...key)
            } else {
              await this.pressKey(key)
            }
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
