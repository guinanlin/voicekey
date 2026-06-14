# shared/

主进程与渲染进程共享的类型、常量与多语言资源。

## 文件列表

- `types.ts` - 跨进程类型定义与 IPC 通道常量（含 `HotkeyConfig`、`TextLlmConfig`（`provider` 阿里云/天翼云；天翼云 `modelName` 可读名 + `model` 为 Model ID）、`VoiceCommandsConfig` / `VoiceCommandItem`、`QwenCnIntlFlashModelId`、闪记会话/分片 DTO、闪记 IPC、`SessionStartPayload`/`SessionCaptureMode`（PTT 与闪记采集区分）、Overlay 扩展字段、历史、历史关联工匠会话与更新结构）。
- `voice-commands.ts` - 内置 6 条语音指令默认触发词与 Prompt、`normalizeVoiceCommandsConfig`、`parseVoiceCommandInput`（末尾剥离 `小猪佩奇微信` 触发词或 `[小猪佩奇:微信]` 方括号标记）。
- `types.ts` 另含 `CraftsmanChatPayload` / `CraftsmanChatResult` 与 `CRAFTSMAN_CHAT` IPC。
- `craftsman-chat-utils.ts` - `truncateChatHistory`（工匠聊天 10 轮上下文截断）。
- `constants.ts` - GLM ASR、DashScope（multimodal / **text-generation** / **compatible-mode chat/completions** URL 辅助函数、`TEXT_LLM_DEFAULT_MODEL`、千问 cn/intl Flash 双版本模型 ID）、**CTYUN Wishub**（`ctyunChatCompletionsUrl`、`textLlmDefaultGenerationUrl`）、默认快捷键（含闪记开始/结束）、`FLASH_NOTE` 分片常量（240s/300s）、`DEFAULT_AUDIO_CAPTURE_PREFERENCES`（回声/降噪/AGC 默认关，约束失败回退开）/ Opus 码率选项、ERPNextCN 常量。
- `i18n.ts` - 共享 i18n 资源与语言解析工具（resolveLanguage/getLocale）。
- `locales/en.json` - 英文文案资源。
- `locales/zh.json` - 中文文案资源。
