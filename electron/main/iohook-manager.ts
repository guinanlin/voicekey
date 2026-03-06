import { uIOhook, UiohookKey, UiohookKeyboardEvent } from 'uiohook-napi'
import { EventEmitter } from 'events'

// Define supported modifiers
const MODIFIERS = {
  SHIFT: new Set([UiohookKey.Shift, UiohookKey.ShiftRight]),
  CTRL: new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]),
  ALT: new Set([UiohookKey.Alt, UiohookKey.AltRight]),
  META: new Set([UiohookKey.Meta, UiohookKey.MetaRight]), // Command on Mac, Windows key on Win
}

// All modifier keys for exact match checking
const ALL_MODIFIER_KEYS: Set<number> = new Set([
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
])

export class IOHookManager extends EventEmitter {
  private pressedKeys: Set<number> = new Set()
  private isListening = false
  private debug = false

  constructor() {
    super()
  }

  start(debug = false) {
    if (this.isListening) return

    this.debug = debug
    this.pressedKeys.clear()

    uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })
    uIOhook.on('keyup', (e: UiohookKeyboardEvent) => {
      this.handleInput(e)
    })

    uIOhook.start()
    this.isListening = true
    if (this.debug) console.log('[IOHook] Started')
  }

  stop() {
    if (!this.isListening) return
    uIOhook.stop()
    this.pressedKeys.clear()
    this.isListening = false
    if (this.debug) console.log('[IOHook] Stopped')
  }

  private handleInput(e: UiohookKeyboardEvent) {
    // uiohook-napi exposes e.type.
    // 4 = KeyPressed (KeyDown)
    // 5 = KeyReleased (KeyUp)

    if (e.type === 4) {
      // KeyDown
      this.pressedKeys.add(e.keycode)
      if (this.debug)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reverse keycode→name lookup
        console.log('[IOHook] KeyDown:', e.keycode, (UiohookKey as any)[e.keycode])
      this.emit('keydown', e.keycode)
      console.log('IOHookManager: pressedKeys:', this.pressedKeys)
      this.checkHotkeys()
    } else if (e.type === 5) {
      // KeyUp
      this.pressedKeys.delete(e.keycode)
      if (this.debug)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reverse keycode→name lookup
        console.log('[IOHook] KeyUp:', e.keycode, (UiohookKey as any)[e.keycode])
      this.emit('keyup', e.keycode)
      console.log('IOHookManager: pressedKeys:', this.pressedKeys)
    }
  }

  private checkHotkeys() {
    // For PTT, the main process handles logic by querying isPressed().
  }

  /**
   * 检查指定的快捷键组合是否"当前正被按住"
   *
   * 严格匹配：左 Ctrl 与右 Ctrl 分别独立，互不替代。
   * PTT 设为 "Control"  → 仅左 Ctrl 触发
   * PTT 设为 "ControlRight" → 仅右 Ctrl 触发
   *
   * @param modifiers - 需要按住的修饰键数组，如 ['meta', 'shift']
   * @param key - 需要按住的主键 keycode
   * @returns true = 用户正在按住配置的快捷键组合；false = 未按住或已松开
   */
  isPressed(modifiers: string[], key: number): boolean {
    // 1. 主键必须精确按下
    if (!this.pressedKeys.has(key)) return false

    // 2. 所有要求的修饰键必须按住
    for (const mod of modifiers) {
      if (!this.hasModifier(mod)) return false
    }

    // 3. 不允许多余的修饰键（精确匹配）
    // 注意：若主键本身是修饰键（如 CtrlRight），它在 ALL_MODIFIER_KEYS 中，
    // 但由于 "if (pressedKey === key) continue" 会跳过，不会误判为"多余"
    const requiredModifierKeys = this.getRequiredModifierKeys(modifiers)

    for (const pressedKey of this.pressedKeys) {
      if (pressedKey === key) continue
      if (ALL_MODIFIER_KEYS.has(pressedKey) && !requiredModifierKeys.has(pressedKey)) {
        return false
      }
    }

    return true
  }

  // Get all keycodes that belong to the specified modifiers
  // e.g., ['shift', 'meta'] -> Set { Shift, ShiftRight, Meta, MetaRight }
  private getRequiredModifierKeys(modifiers: string[]): Set<number> {
    const keys = new Set<number>()
    for (const mod of modifiers) {
      const modSet = MODIFIERS[mod.toUpperCase() as keyof typeof MODIFIERS]
      if (modSet) {
        for (const k of modSet) {
          keys.add(k)
        }
      }
    }
    return keys
  }

  private hasModifier(mod: string): boolean {
    const modSet = MODIFIERS[mod.toUpperCase() as keyof typeof MODIFIERS]
    if (!modSet) return false

    for (const key of modSet) {
      if (this.pressedKeys.has(key)) return true
    }
    return false
  }
}

export const ioHookManager = new IOHookManager()
