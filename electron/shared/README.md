# shared/

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量（含 `HotkeyConfig`、闪记会话/分片 DTO、闪记 IPC、`SessionStartPayload`/`SessionCaptureMode`（PTT 与闪记采集区分）、Overlay 扩展字段、历史与更新结构）。
- `constants.ts` - GLM ASR、DashScope、默认快捷键（含闪记开始/结束）、`FLASH_NOTE` 分片常量（240s/300s）、`DEFAULT_AUDIO_CAPTURE_PREFERENCES`（回声/降噪/AGC 默认关，约束失败回退开）/ Opus 码率选项、ERPNextCN 常量。
- `i18n.ts` - 共享 i18n 资源与语言解析工具（resolveLanguage/getLocale）。
- `locales/en.json` - 英文文案资源。
- `locales/zh.json` - 中文文案资源。
