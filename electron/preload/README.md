# preload/

Electron 预加载脚本目录，作为主进程和渲染进程之间的安全桥梁。

## 文件列表

### `preload.ts`

IPC 通信桥接脚本，运行在渲染进程上下文但可访问部分 Node.js API：

#### 功能职责

- **contextBridge** - 安全地暴露 `window.electronAPI` 给渲染进程
- **IPC 封装** - 封装 `ipcRenderer.invoke` 和 `ipcRenderer.on` 调用
- **类型定义** - 导出 `ElectronAPI` 接口供渲染进程 TypeScript 使用

#### 暴露的 API

**配置管理**

- `getConfig()` - 获取完整应用配置
- `setConfig(config)` - 保存配置（可含 `app.audioCapture` 录音参数等，`CONFIG_SET` 内与已有配置合并）
- `testConnection(config?)` - 测试 ASR API 连接
- `testTextLlmConnection(config?)` - 测试文本模型连接（阿里云/天翼云，`CONFIG_TEST_TEXT_LLM`）
- `craftsmanChat(payload)` - 工匠页多轮聊天，调用文本模型（`CRAFTSMAN_CHAT`）
- `runDiagnostics()` - 主进程诊断（网络 / ASR / 文本模型 / 归档），返回 `DiagnosticsRunResult`（`IPC_CHANNELS.DIAGNOSTICS_RUN`）

**录音会话**

- `onStartRecording(callback)` - 监听录音开始信号（主进程 → 渲染）；回调接收可选 `SessionStartPayload`（`captureMode: 'ptt' | 'flash'`），供渲染进程区分一键转写与闪记采集策略
- `onStopRecording(callback)` - 监听录音停止信号（主进程 → 渲染）
- `sendAudioData(buffer)` - 发送录制的音频数据（渲染 → 主进程）
- `sendError(error)` - 发送错误信息

**快捷键**

- `registerHotkey(accelerator)` - 注册全局快捷键
- `unregisterHotkey(accelerator)` - 注销快捷键

**历史记录**

- `getHistory()` / `clearHistory()` / `deleteHistoryItem(id)` - 读取、清空、删除
- `onHistoryChanged(callback)` - 主进程追加历史后通知（如 HTTP `/clipboard/type` 成功）

**闪记**

- `getFlashSessions()` / `getActiveFlashSession()` - 读取闪记历史会话与当前进行中会话（含分片）
- `startFlashSession()` / `endFlashSession()` - 开始或结束闪记会话
- `updateFlashSummary(sessionId, summary)` - 更新会话总结文本
- `generateFlashSummary(sessionId, systemPrompt)` - 聚合成功分片转写并调用 DashScope（默认 compatible-mode chat/completions），写入 DB 后返回 `{ ok, summary? }` 或 `{ ok: false, code, message? }`
- `downloadFlashChunk(chunkId)` / `playFlashChunk(chunkId)` - 下载分片音频或调用系统播放器打开
- `onFlashStateChanged(callback)` - 会话或分片状态变化通知

**事件监听**

- `onSessionStatus(callback)` - 会话状态变化
- `onTranscription(callback)` - 转录结果返回
- `onError(callback)` - 错误通知

**系统信息**

- `platform` - 当前操作系统平台（darwin/win32/linux）
- `checkForUpdates()` - 触发更新检查（打包版走 `electron-updater`，开发环境回退 GitHub API）
- `getUpdateStatus()` - 获取启动时自动检查的缓存结果（如果有）
- `openExternal(url)` - 打开外部链接（用于发布页）

#### 安全机制

- 使用 `contextBridge` 避免直接暴露 Node.js 能力
- 所有 IPC 调用基于预定义的 `IPC_CHANNELS` 常量
- 禁用 `nodeIntegration`，启用 `contextIsolation`
