# main/

Electron 主进程目录，负责窗口管理、IPC、录音流程、ASR 调用与文本注入。

## 文件列表

- `main.ts` - 应用入口；创建后台/设置/浮窗窗口、托盘菜单与 IPC 处理，协调 PTT 录音 → 转录 → 注入流程并初始化 FFmpeg。`handleAudioData` 按 `asr.provider` 分支：**GLM** 仍为 WebM → FFmpeg → MP3，ERPNext 并行上传 MP3 + 本地 GLM multipart；**千问** 不落 MP3，直接上传 WebM（Opus）至 ERPNext，再以公网 URL 调 DashScope **同步** `multimodal-generation`。后台录音窗口 `webPreferences.backgroundThrottling: false`，避免隐藏窗口节流导致 MediaRecorder 数据几乎为空。
- `i18n.ts` - 主进程 i18next 初始化与语言切换。
- `config-manager.ts` - 使用 `electron-store` 持久化应用偏好、ASR 配置、快捷键与 ERPNextCN DTY 上传配置。
- `erpnextcn-upload.ts` - 通用 multipart 上传（`contentType` 由调用方指定）；千问用 `audio/webm`，GLM 归档用 `audio/mpeg`。`fileUrlFromErpnextUploadResponse` 从成功响应拼公网 HTTPS URL 供 DashScope `audio` 使用。
- `qwen-asr-provider.ts` - 阿里云 DashScope **短音频同步** ASR：`POST .../services/aigc/multimodal-generation/generation`，`input.messages` 中带公网 `audio` URL；解析 `output.choices[0].message.content` 中的 `text`。模型按地域为 `qwen3-asr-flash` 或 `qwen3-asr-flash-us`。含 `testQwenDashScopeConnection`。
- `history-manager.ts` - 录音历史存储（最多 1000 条），提供增删清空与统计接口。
- `hotkey-manager.ts` - 基于 `globalShortcut` 的全局快捷键注册/注销。
- `iohook-manager.ts` - 基于 `uiohook-napi` 的键盘钩子，检测 PTT 组合键按住状态。
- `asr-provider.ts` - 调用 GLM ASR API（axios + FormData）；解析响应时兼容 `{ text }` 与 `{ choices[0].message.content }` 两种 JSON 形态。
- `text-injector.ts` - 基于 `@nut-tree-fork/nut-js` 注入文本；Windows/Linux 通过剪贴板写入 + Ctrl+V 粘贴（不恢复注入前剪贴板），Linux 粘贴与 `after_key` 优先 `xdotool key --clearmodifiers`（与 nut-js 回退），macOS 使用 `keyboard.type()` 并校验辅助功能权限；提供 HTTP API 所需方法（typeText、pressKeyFromString、getStatus、checkPermissionsExtended）。
- `http-server.ts` - Fastify HTTP 服务器，暴露剪贴板/输入 REST API（端口 4321），自动生成 OpenAPI/Swagger 文档；`/clipboard/type` 成功时写入 `history-manager` 并向所有窗口广播 `history:changed`。
- `updater-manager.ts` - 打包版通过 `electron-updater` 检查/下载/安装更新并广播进度事件；开发环境回退 GitHub API 仅用于版本检查。
