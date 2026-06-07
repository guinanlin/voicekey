import { findVoiceCommandById, parseVoiceCommandInput } from '../shared/voice-commands'
import { generateTextWithTextLlm } from './dashscope-text-generation'
import { configManager } from './config-manager'
import { t } from './i18n'

export interface ResolvedInjectionText {
  text: string
  usedCommand: boolean
  commandId?: string
}

/** 识别末尾触发词并可选调用文本模型；无指令时返回原文 */
export async function resolveTextForInjection(rawText: string): Promise<ResolvedInjectionText> {
  const trimmed = rawText.trim()
  if (!trimmed) return { text: trimmed, usedCommand: false }

  const voiceCommands = configManager.getVoiceCommandsConfig()
  const parsed = parseVoiceCommandInput(trimmed, voiceCommands.commands)
  if (!parsed) return { text: trimmed, usedCommand: false }

  const cmd = findVoiceCommandById(voiceCommands.commands, parsed.commandId)
  if (!cmd) return { text: trimmed, usedCommand: false }

  const textLlm = configManager.getTextLlmConfig()
  if (!textLlm.apiKey?.trim()) {
    throw new Error(t('errors.commandNeedsTextLlm'))
  }

  const generated = await generateTextWithTextLlm(textLlm, [
    { role: 'system', content: cmd.prompt },
    { role: 'user', content: parsed.content },
  ])

  const text = generated.trim()
  if (!text) {
    throw new Error(t('errors.commandFailed', { message: 'Empty model response' }))
  }

  return { text, usedCommand: true, commandId: parsed.commandId }
}
