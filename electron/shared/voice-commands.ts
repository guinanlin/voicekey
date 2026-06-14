import type { VoiceCommandId, VoiceCommandItem, VoiceCommandsConfig } from './types'

/** 出厂内置指令；新增指令时在此追加并在 i18n 补文案 */
export const DEFAULT_VOICE_COMMANDS: VoiceCommandItem[] = [
  {
    id: 'polish',
    trigger: '小猪佩奇润色',
    prompt: `你是一名专业的中文编辑。

请将用户输入的内容进行润色。

要求：

1. 保留原意，不改变观点。
2. 删除口头禅、重复表达和无意义停顿。
3. 补充标点符号和合理分段。
4. 调整语序，使表达更流畅自然。
5. 输出风格为自然书面语，而非公文或营销文案。
6. 不要扩写内容，不要增加用户未表达的信息。

注意：

如果文本末尾包含“小猪佩奇润色”等命令词，请忽略该命令词。

仅输出润色后的内容。`,
  },
  {
    id: 'summary',
    trigger: '小猪佩奇总结',
    prompt: `你是一名专业的信息整理助手。

请对用户输入内容进行总结。

要求：

1. 提炼核心观点。
2. 保留重要信息。
3. 删除冗余描述。
4. 使用清晰的层级结构。
5. 输出不超过5个核心要点。

输出格式：

【核心摘要】

一句话总结。

【核心要点】

1.
2.
3.

如果文本末尾包含“小猪佩奇总结”等命令词，请忽略该命令词。`,
  },
  {
    id: 'translate',
    trigger: '小猪佩奇翻译',
    prompt: `你是一名专业翻译助手。

请自动识别输入语言：

- 如果输入为中文，翻译成英文。
- 如果输入为英文，翻译成中文。

要求：

1. 保留原意。
2. 表达自然地道。
3. 不逐字翻译。
4. 保持专业表达。

如果文本末尾包含“小猪佩奇翻译”等命令词，请忽略该命令词。

仅输出翻译结果。`,
  },
  {
    id: 'wechat',
    trigger: '小猪佩奇微信',
    prompt: `你是一名商务沟通助手。

请将用户输入内容整理为适合微信发送的消息。

要求：

1. 保持礼貌自然。
2. 语气专业但不生硬。
3. 不要使用邮件格式。
4. 不要出现“尊敬的”、“此致敬礼”等邮件表达。
5. 适合微信、企业微信、飞书等即时通讯工具。
6. 可适当分段提高可读性。

如果文本末尾包含“小猪佩奇微信”等命令词，请忽略该命令词。

仅输出最终微信消息内容。`,
  },
  {
    id: 'twitter',
    trigger: '小猪佩奇推特',
    prompt: `你是一名资深社交媒体内容编辑。

请将用户输入内容整理为适合发布到 X（Twitter）的推文。

要求：

1. 保留核心观点。
2. 内容简洁有力。
3. 重点突出。
4. 使用自然表达。
5. 控制在140个英文单词以内或280个中文字符以内。
6. 可以适当拆分段落增强阅读体验。
7. 不要使用标题。

如果文本末尾包含“小猪佩奇推特”等命令词，请忽略该命令词。

仅输出最终推文内容。`,
  },
  {
    id: 'email',
    trigger: '小猪佩奇邮件',
    prompt: `你是一名商务邮件写作助手。

请将用户输入内容整理为一封专业邮件。

要求：

1. 自动生成合适主题。
2. 使用规范邮件结构。
3. 保持专业礼貌。
4. 保留原始意图。
5. 表达清晰简洁。

输出格式：

主题：

正文：

如果文本末尾包含“小猪佩奇邮件”等命令词，请忽略该命令词。

仅输出邮件内容。`,
  },
]

const DEFAULT_BY_ID = new Map(DEFAULT_VOICE_COMMANDS.map((c) => [c.id, c]))

/** 内置指令中文展示名（工匠页 / HTTP 历史关联会话） */
export const VOICE_COMMAND_LABELS: Record<VoiceCommandId, string> = {
  polish: '润色',
  summary: '总结',
  translate: '翻译',
  wechat: '微信',
  twitter: '推特',
  email: '邮件',
}

export function getDefaultVoiceCommand(id: VoiceCommandId): VoiceCommandItem {
  const def = DEFAULT_BY_ID.get(id)
  if (!def) throw new Error(`Unknown voice command: ${id}`)
  return { ...def }
}

/** 合并用户配置与内置默认；保留用户自定义扩展指令 */
export function normalizeVoiceCommandsConfig(
  raw: VoiceCommandsConfig | undefined,
): VoiceCommandsConfig {
  const stored = raw?.commands ?? []
  const storedById = new Map(stored.map((c) => [c.id, c]))

  const mergedBuiltIn = DEFAULT_VOICE_COMMANDS.map((def) => {
    const user = storedById.get(def.id)
    return {
      id: def.id,
      trigger: user?.trigger?.trim() || def.trigger,
      prompt: user?.prompt?.trim() || def.prompt,
    }
  })

  const builtInIds = new Set(DEFAULT_VOICE_COMMANDS.map((c) => c.id))
  const extras = stored.filter((c) => !builtInIds.has(c.id) && c.trigger.trim() && c.prompt.trim())

  return { commands: [...mergedBuiltIn, ...extras] }
}

export interface ParsedVoiceCommand {
  commandId: VoiceCommandId
  content: string
  trigger: string
}

/** 方括号标记 `[小猪佩奇:动作]` 中的动作名 → 内置指令 ID */
const BRACKET_ACTION_TO_COMMAND_ID: Record<string, VoiceCommandId> = {
  润色: 'polish',
  总结: 'summary',
  翻译: 'translate',
  微信: 'wechat',
  推特: 'twitter',
  邮件: 'email',
}

const BRACKET_COMMAND_PATTERN = /\[小猪佩奇[:：]([^\]]+)\]\s*$/

/** 识别末尾 `[小猪佩奇:微信]` 等方括号智能指令 */
function parseBracketVoiceCommand(text: string): ParsedVoiceCommand | null {
  const match = text.match(BRACKET_COMMAND_PATTERN)
  if (!match || match.index === undefined) return null

  const action = match[1].trim()
  const commandId = BRACKET_ACTION_TO_COMMAND_ID[action]
  if (!commandId) return null

  const content = text.slice(0, match.index).trim()
  if (!content) return null

  return {
    commandId,
    content,
    trigger: match[0].trim(),
  }
}

/**
 * 从转写全文末尾识别触发词，剥离后返回正文与指令 ID。
 * 支持 `[小猪佩奇:微信]` 方括号标记，以及原有 `小猪佩奇微信` 后缀触发词（允许其前有空白或换行）。
 */
export function parseVoiceCommandInput(
  rawText: string,
  commands: VoiceCommandItem[],
): ParsedVoiceCommand | null {
  const text = rawText.trim()
  if (!text) return null

  const bracket = parseBracketVoiceCommand(text)
  if (bracket) return bracket

  const sorted = [...commands].sort((a, b) => b.trigger.length - a.trigger.length)

  for (const cmd of sorted) {
    const trigger = cmd.trigger.trim()
    if (!trigger) continue

    const idx = text.lastIndexOf(trigger)
    if (idx === -1) continue

    const after = text.slice(idx + trigger.length).trim()
    if (after.length > 0) continue

    const content = text.slice(0, idx).trim()
    if (!content) continue

    return { commandId: cmd.id, content, trigger }
  }

  return null
}

export function findVoiceCommandById(
  commands: VoiceCommandItem[],
  id: VoiceCommandId,
): VoiceCommandItem | undefined {
  return commands.find((c) => c.id === id)
}
