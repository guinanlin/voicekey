# components/

React 组件目录，包含应用级组件和 UI 基础组件库。

## 子目录

### `ui/`

shadcn/ui 组件库，基于 Radix UI 构建的可复用 UI 组件集合。包含 Button、Input、Card、Dialog 等基础组件。

## 文件

### `AudioRecorder.tsx`

无头音频录制组件，负责：

- 监听主进程 `SESSION_START` / `SESSION_STOP` 信号启停录音
- **闪记分片间复用同一条麦克风流**（仅重建 `MediaRecorder`），PTT 结束约 2 秒无新 `SESSION_START` 则 `stop` 轨并释放
- 采集：主进程 `SESSION_START` 带 `captureMode`（用于日志/区分场景）；**PTT 与闪记** 新开流时均按 `app.audioCapture` 走 `acquireMicFromPrefs`（`ideal` 软约束、失败可回退 `audio:true`），避免 PTT 单独 `{ audio:true }` 触发浏览器默认处理与设置页不一致；仅 `MediaRecorder`；码率由 `getConfig()`；优先 `audio/webm;codecs=opus`；`start(250ms)` 分片；`requestData()` + `setTimeout(50)` 再 `stop()`
- 录制并发送音频数据回主进程
- 不渲染任何 UI（返回 `null`）

### `HUD.tsx`

极简风格的录音状态浮窗组件（深色模式）：

- 显示录音状态和实时波形动画
- 支持 PTT / 闪记两种模式：闪记态展示会话标识与主进程上报时长
- 取消/完成：PTT 调 `stopSession`（SESSION_STOP）；**闪记调 `endFlashSession`（FLASH_END）**——勿对闪记只调 `stopSession`，否则主进程无 `currentSession` 会直接忽略
- 主进程在 **`status === 'recording'`** 时对 overlay 调用 **`setIgnoreMouseEvents(false)`**（`showOverlay`/`updateOverlay`），否则窗口默认可穿透点击，渲染进程永远收不到 `mouseenter`，结束按钮无法点击；`mouseleave` 在录音态不再恢复穿透
- 展示处理中、成功或错误状态反馈；`noTextInjected` 时成功态不显示「已注入」
- 自适应状态球和紧凑布局

### `HotkeyRecorder.tsx`

快捷键录制组件，负责：

- 监听主进程的快捷键信号
- 管理快捷键生命周期（防止麦克风占用和内存泄漏）
- 录制并发送快捷键数据回主进程
- 不渲染任何 UI（返回 `null`）

### `ChatPanel.tsx`

工匠页右侧聊天组件：`ref.startCommand` 接收指令 Prompt + 历史文本并自动发起首条请求；多轮对话经 `craftsmanChat` IPC 调用文本模型（保留最近 10 轮上下文）；AI 回复气泡右下角可复制；附件仅 UI 展示；发送后自动滚底。

### `CommandSettings.tsx`

设置页「指令」Tab：折叠列表展示 6 条内置指令（润色/总结/翻译/微信/推特/邮件），展开后编辑 Prompt、单条恢复默认；触发词只读展示。

## HotkeySettings

快捷键设置组件，负责：

- 渲染快捷键设置界面
- 管理四类快捷键状态（录音、闪记开始、闪记结束、打开设置）
- 提供快捷键录制功能
- 校验快捷键有效性与跨字段去重
- 提供快捷键重置功能
