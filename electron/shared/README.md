# shared/

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量（含 `AppPreferences.audioCapture`、Overlay、历史与更新结构）。
- `constants.ts` - GLM ASR、DashScope、默认快捷键、`DEFAULT_AUDIO_CAPTURE_PREFERENCES` / Opus 码率选项、ERPNextCN 常量。
- `i18n.ts` - 共享 i18n 资源与语言解析工具（resolveLanguage/getLocale）。
- `locales/en.json` - 英文文案资源。
- `locales/zh.json` - 中文文案资源。
