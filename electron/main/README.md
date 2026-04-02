# main/

Electron 主进程目录，负责窗口管理、IPC、录音流程、ASR 调用与文本注入。

## 文件列表

- `main.ts` - 应用入口；创建后台/设置/浮窗窗口、托盘菜单与 IPC 处理，协调 PTT 录音 → 转录 → 注入流程并初始化 FFmpeg。`handleAudioData` 按 `asr.provider` 分支：GLM 为 ERPNext 并行 + 本地 GLM；千问为先 await ERPNext 上传再 DashScope。后台录音窗口 `webPreferences.backgroundThrottling: false`，避免隐藏窗口节流导致 MediaRecorder 数据几乎为空。
- `i18n.ts` - 主进程 i18next 初始化与语言切换。
- `config-manager.ts` - 使用 `electron-store` 持久化应用偏好、ASR 配置、快捷键与 ERPNextCN DTY 上传配置。
- `erpnextcn-upload.ts` - 将转码后的 MP3 以 multipart 上传到 ERPNextCN DTY OSS；Host/Key 在设置页持久化。提供 `fileUrlFromErpnextUploadResponse`，从成功响应拼公网 HTTPS URL 供千问 `file_url` 使用。
- `qwen-asr-provider.ts` - 阿里云 DashScope 异步 ASR：`POST .../services/audio/asr/transcription` 提交任务、`GET .../tasks/{id}` 轮询，成功后拉取 `transcription_url` JSON 解析 `transcripts[].text`；含 `testQwenDashScopeConnection`。
- `history-manager.ts` - 录音历史存储（最多 1000 条），提供增删清空与统计接口。
- `hotkey-manager.ts` - 基于 `globalShortcut` 的全局快捷键注册/注销。
- `iohook-manager.ts` - 基于 `uiohook-napi` 的键盘钩子，检测 PTT 组合键按住状态。
- `asr-provider.ts` - 调用 GLM ASR API（axios + FormData）；解析响应时兼容 `{ text }` 与 `{ choices[0].message.content }` 两种 JSON 形态。
- `text-injector.ts` - 基于 `@nut-tree-fork/nut-js` 注入文本；Windows/Linux 通过剪贴板写入 + Ctrl+V 粘贴（不恢复注入前剪贴板），Linux 粘贴与 `after_key` 优先 `xdotool key --clearmodifiers`（与 nut-js 回退），macOS 使用 `keyboard.type()` 并校验辅助功能权限；提供 HTTP API 所需方法（typeText、pressKeyFromString、getStatus、checkPermissionsExtended）。
- `http-server.ts` - Fastify HTTP 服务器，暴露剪贴板/输入 REST API（端口 4321），自动生成 OpenAPI/Swagger 文档；`/clipboard/type` 成功时写入 `history-manager` 并向所有窗口广播 `history:changed`。
- `updater-manager.ts` - 打包版通过 `electron-updater` 检查/下载/安装更新并广播进度事件；开发环境回退 GitHub API 仅用于版本检查。
