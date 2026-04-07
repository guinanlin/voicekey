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
- 提供取消/完成操作按钮
- 展示处理中、成功或错误状态反馈；`noTextInjected` 时成功态不显示「已注入」
- 自适应状态球和紧凑布局

### `HotkeyRecorder.tsx`

快捷键录制组件，负责：

- 监听主进程的快捷键信号
- 管理快捷键生命周期（防止麦克风占用和内存泄漏）
- 录制并发送快捷键数据回主进程
- 不渲染任何 UI（返回 `null`）

## HotkeySettings

快捷键设置组件，负责：

- 渲染快捷键设置界面
- 管理四类快捷键状态（录音、闪记开始、闪记结束、打开设置）
- 提供快捷键录制功能
- 校验快捷键有效性与跨字段去重
- 提供快捷键重置功能
