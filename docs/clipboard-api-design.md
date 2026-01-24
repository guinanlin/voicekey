# 剪贴板/输入 API 设计文档

## 概述

本文档描述在 Voice Key 项目中添加剪贴板/输入 API 的设计方案。这些 API 参考了 `dty-voice/backend` 的实现，但适配到 Electron 主进程架构，通过 IPC 暴露给渲染进程。

## 目标

1. **扩展文本输入功能**：支持两种模式（直接输入 vs 仅剪贴板）
2. **按键模拟 API**：通过字符串名称模拟按键操作
3. **服务状态检查**：提供详细的服务状态和权限信息
4. **统一错误处理**：使用标准错误码系统

## 现有实现分析

### 当前 `text-injector.ts` 功能

- ✅ `injectText(text: string)`: 文本注入（Windows 用剪贴板，macOS/Linux 用键盘输入）
- ✅ `checkPermissions()`: 权限检查（主要针对 macOS）
- ✅ `pressKey(key: Key)`: 按键模拟（但只接受 `Key` 枚举）
- ✅ 剪贴板快照/恢复机制

### 需要扩展的功能

1. **文本输入模式选择**：`"type"`（直接输入）vs `"clipboard"`（仅同步到剪贴板）
2. **后置按键支持**：输入后自动按指定键（如 Enter、Tab）
3. **字符串按键映射**：将字符串（如 `"enter"`）转换为 `Key` 枚举
4. **服务状态 API**：返回 ready/warning/error/disabled 状态
5. **详细权限信息**：平台支持、依赖可用性等

## API 设计

### 1. `clipboard:type` - 文本输入

**IPC 通道**: `clipboard:type`

**请求参数**:

```typescript
interface TypeTextRequest {
  text: string // 要输入的文本内容
  mode?: 'type' | 'clipboard' // 输入模式，默认 'type'
  afterKey?: string // 粘贴后要按的按键（可选）
}
```

**响应**:

```typescript
interface ClipboardResponse {
  success: boolean
  message?: string
  error?: string
  code?: string // 错误码：PERMISSION_DENIED, INVALID_PARAMETER, etc.
}
```

**行为**:

- `mode === 'type'`: 调用现有 `injectText()` 逻辑（需要权限）
- `mode === 'clipboard'`: 仅写入剪贴板（`clipboard.writeText()`，无需权限）
- `afterKey`: 仅在 `mode === 'type'` 时有效，输入完成后按指定键

**错误码**:

- `PERMISSION_DENIED`: 需要权限但未授权（仅 type 模式）
- `INVALID_PARAMETER`: 参数无效（空文本、超长文本、无效模式等）
- `SERVICE_DISABLED`: 服务被禁用（未来可配置）

---

### 2. `clipboard:key` - 按键模拟

**IPC 通道**: `clipboard:key`

**请求参数**:

```typescript
interface PressKeyRequest {
  key: string // 按键名称，如 'enter', 'tab', 'ctrl_enter'
}
```

**响应**:

```typescript
interface ClipboardResponse {
  success: boolean
  message?: string
  error?: string
  code?: string
}
```

**支持的按键**:

- 基础按键: `enter`, `tab`, `backspace`, `esc`, `space`
- 方向键: `up`, `down`, `left`, `right`
- 组合键: `ctrl_enter` (Ctrl+Enter)
- 其他: `home`, `end`, `pageup`, `pagedown`, `delete`

**错误码**:

- `PERMISSION_DENIED`: 需要权限但未授权
- `INVALID_PARAMETER`: 无效的按键名称
- `SERVICE_DISABLED`: 服务被禁用

---

### 3. `clipboard:status` - 服务状态

**IPC 通道**: `clipboard:status`

**请求参数**: 无

**响应**:

```typescript
interface ClipboardStatusResponse {
  status: 'ready' | 'warning' | 'error' | 'disabled'
  message: string
  permission: boolean
}
```

**状态说明**:

- `ready`: 服务就绪，权限正常
- `warning`: 服务可用但权限不足（可降级到剪贴板模式）
- `error`: 平台不支持或依赖缺失
- `disabled`: 服务被禁用（未来可配置）

---

### 4. `clipboard:permission` - 权限检查

**IPC 通道**: `clipboard:permission`

**请求参数**: 无

**响应**:

```typescript
interface ClipboardPermissionResponse {
  has_permission: boolean
  platform_supported: boolean
  dependencies_available: boolean
  message: string
}
```

**字段说明**:

- `has_permission`: 是否有键盘模拟权限（macOS 辅助功能，Windows 通常不需要）
- `platform_supported`: 平台是否支持（Windows/macOS/Linux 都支持）
- `dependencies_available`: nut-js 是否可用
- `message`: 详细的权限状态描述

---

## 技术实现

### 1. 扩展 `text-injector.ts`

#### 新增方法

```typescript
// 文本输入（支持模式和后置按键）
async typeText(
  text: string,
  mode: 'type' | 'clipboard' = 'type',
  afterKey?: string
): Promise<{ success: boolean; message?: string; error?: string; code?: string }>

// 按键模拟（字符串版本）
async pressKeyFromString(keyName: string): Promise<{ success: boolean; message?: string; error?: string; code?: string }>

// 服务状态
getStatus(): { status: string; message: string; permission: boolean }

// 扩展权限检查
async checkPermissionsExtended(): Promise<{
  has_permission: boolean
  platform_supported: boolean
  dependencies_available: boolean
  message: string
}>
```

#### 字符串到 Key 映射

```typescript
private stringToKey(keyName: string): Key | Key[] | null {
  const lower = keyName.toLowerCase()

  // 组合键
  if (lower === 'ctrl_enter') {
    return [Key.LeftControl, Key.Enter]
  }

  // 基础按键映射
  const keyMap: Record<string, Key> = {
    'enter': Key.Enter,
    'tab': Key.Tab,
    'backspace': Key.Backspace,
    'esc': Key.Escape,
    'escape': Key.Escape,
    'space': Key.Space,
    'up': Key.Up,
    'down': Key.Down,
    'left': Key.Left,
    'right': Key.Right,
    'home': Key.Home,
    'end': Key.End,
    'pageup': Key.PageUp,
    'pagedown': Key.PageDown,
    'delete': Key.Delete,
    // ... 更多按键
  }

  return keyMap[lower] || null
}
```

### 2. IPC 处理器（`main.ts`）

在 `setupIPCHandlers()` 中添加：

```typescript
// 剪贴板/输入相关
ipcMain.handle(IPC_CHANNELS.CLIPBOARD_TYPE, async (_event, request: TypeTextRequest) => {
  return await textInjector.typeText(request.text, request.mode, request.afterKey)
})

ipcMain.handle(IPC_CHANNELS.CLIPBOARD_KEY, async (_event, request: PressKeyRequest) => {
  return await textInjector.pressKeyFromString(request.key)
})

ipcMain.handle(IPC_CHANNELS.CLIPBOARD_STATUS, () => {
  return textInjector.getStatus()
})

ipcMain.handle(IPC_CHANNELS.CLIPBOARD_PERMISSION, async () => {
  return await textInjector.checkPermissionsExtended()
})
```

### 3. IPC 通道定义（`shared/types.ts`）

```typescript
export const IPC_CHANNELS = {
  // ... 现有通道

  // 剪贴板/输入相关
  CLIPBOARD_TYPE: 'clipboard:type',
  CLIPBOARD_KEY: 'clipboard:key',
  CLIPBOARD_STATUS: 'clipboard:status',
  CLIPBOARD_PERMISSION: 'clipboard:permission',
} as const
```

### 4. Preload API（`preload.ts`）

```typescript
export interface ElectronAPI {
  // ... 现有 API

  // 剪贴板/输入相关
  clipboardType: (request: TypeTextRequest) => Promise<ClipboardResponse>
  clipboardKey: (request: PressKeyRequest) => Promise<ClipboardResponse>
  clipboardStatus: () => Promise<ClipboardStatusResponse>
  clipboardPermission: () => Promise<ClipboardPermissionResponse>
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ... 现有实现

  clipboardType: (request) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_TYPE, request),
  clipboardKey: (request) => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_KEY, request),
  clipboardStatus: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_STATUS),
  clipboardPermission: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_PERMISSION),
})
```

### 5. 类型定义（`shared/types.ts`）

```typescript
// 剪贴板/输入相关类型
export interface TypeTextRequest {
  text: string
  mode?: 'type' | 'clipboard'
  afterKey?: string
}

export interface PressKeyRequest {
  key: string
}

export interface ClipboardResponse {
  success: boolean
  message?: string
  error?: string
  code?: string
}

export interface ClipboardStatusResponse {
  status: 'ready' | 'warning' | 'error' | 'disabled'
  message: string
  permission: boolean
}

export interface ClipboardPermissionResponse {
  has_permission: boolean
  platform_supported: boolean
  dependencies_available: boolean
  message: string
}
```

## 错误处理

### 错误码定义

```typescript
export enum ClipboardErrorCode {
  PERMISSION_DENIED = 'PERMISSION_DENIED', // 权限不足
  INVALID_PARAMETER = 'INVALID_PARAMETER', // 参数无效
  SERVICE_DISABLED = 'SERVICE_DISABLED', // 服务禁用
  PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED', // 平台不支持
  DEPENDENCY_MISSING = 'DEPENDENCY_MISSING', // 依赖缺失
  SYSTEM_ERROR = 'SYSTEM_ERROR', // 系统错误
}
```

### 错误处理流程

1. **参数验证**：检查必需参数、类型、范围
2. **权限检查**：根据操作类型检查权限
3. **平台检查**：确认平台支持
4. **依赖检查**：确认 nut-js 可用
5. **执行操作**：捕获异常并转换为标准错误码

## 跨平台兼容性

### Windows

- **权限**：通常不需要特殊权限（除非使用某些系统级功能）
- **实现**：使用剪贴板粘贴方式（现有实现）
- **状态**：`platform_supported: true`

### macOS

- **权限**：需要辅助功能权限（Accessibility）
- **实现**：使用 `keyboard.type()` 直接输入
- **状态**：`platform_supported: true`，`has_permission` 取决于用户授权

### Linux

- **权限**：通常不需要特殊权限
- **实现**：使用 `keyboard.type()` 直接输入
- **状态**：`platform_supported: true`

## 实施计划

### 阶段 1：基础功能（优先级：高）

1. ✅ 扩展 `checkPermissions()` → `checkPermissionsExtended()`
2. ✅ 实现 `getStatus()`
3. ✅ 添加 IPC 通道和处理器
4. ✅ 添加 Preload API

**预计工作量**: 2-3 小时

### 阶段 2：文本输入扩展（优先级：高）

1. ✅ 扩展 `injectText()` → `typeText(text, mode, afterKey)`
2. ✅ 实现 `mode === 'clipboard'` 逻辑
3. ✅ 实现 `afterKey` 支持
4. ✅ 添加 IPC 处理器

**预计工作量**: 3-4 小时

### 阶段 3：按键模拟（优先级：中）

1. ✅ 实现 `stringToKey()` 映射函数
2. ✅ 实现 `pressKeyFromString()`
3. ✅ 支持组合键（如 `ctrl_enter`）
4. ✅ 添加 IPC 处理器

**预计工作量**: 4-5 小时

### 阶段 4：测试和文档（优先级：中）

1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ 更新 README
4. ✅ 使用示例

**预计工作量**: 2-3 小时

## 使用示例

### 渲染进程调用

```typescript
// 1. 检查权限
const permission = await window.electronAPI.clipboardPermission()
console.log(permission)
// {
//   has_permission: true,
//   platform_supported: true,
//   dependencies_available: true,
//   message: '权限正常'
// }

// 2. 检查服务状态
const status = await window.electronAPI.clipboardStatus()
console.log(status)
// {
//   status: 'ready',
//   message: '剪贴板服务就绪',
//   permission: true
// }

// 3. 文本输入（直接输入模式）
const result1 = await window.electronAPI.clipboardType({
  text: 'Hello, World!',
  mode: 'type',
  afterKey: 'enter',
})
console.log(result1)
// { success: true, message: '文本输入成功' }

// 4. 仅同步到剪贴板
const result2 = await window.electronAPI.clipboardType({
  text: 'Hello, World!',
  mode: 'clipboard',
})
console.log(result2)
// { success: true, message: '文本已复制到剪贴板' }

// 5. 按键模拟
const result3 = await window.electronAPI.clipboardKey({ key: 'enter' })
console.log(result3)
// { success: true, message: '按键 enter 模拟成功' }

// 6. 组合键
const result4 = await window.electronAPI.clipboardKey({ key: 'ctrl_enter' })
console.log(result4)
// { success: true, message: '按键 ctrl_enter 模拟成功' }
```

## 注意事项

1. **权限检查**：macOS 需要用户手动授权辅助功能权限
2. **剪贴板恢复**：Windows 模式下会恢复原始剪贴板内容
3. **错误处理**：所有错误都返回标准格式，包含 `code` 字段
4. **异步操作**：所有操作都是异步的，需要 `await`
5. **平台差异**：Windows 使用剪贴板粘贴，macOS/Linux 使用直接输入

## 未来扩展

1. **HTTP 服务**：可选添加本地 HTTP 服务器，供外部应用调用
2. **更多按键支持**：扩展按键映射表，支持更多特殊键
3. **批量操作**：支持批量文本输入或按键序列
4. **配置选项**：允许用户配置服务启用/禁用、延迟时间等

## 参考

- `dty-voice/backend/services/clipboard.py` - Python 实现参考
- `dty-voice/backend/api/endpoints/clipboard.py` - API 端点参考
- `@nut-tree-fork/nut-js` - 键盘模拟库文档
