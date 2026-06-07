import type { CraftsmanChatPayload, CraftsmanChatResult } from '../shared/types'
import { truncateChatHistory } from '../shared/craftsman-chat-utils'
import { generateTextWithTextLlm } from './dashscope-text-generation'
import { configManager } from './config-manager'
import { t } from './i18n'

export { CRAFTSMAN_CHAT_MAX_ROUNDS, truncateChatHistory } from '../shared/craftsman-chat-utils'

export async function runCraftsmanChat(
  payload: CraftsmanChatPayload,
): Promise<CraftsmanChatResult> {
  const systemPrompt = payload.systemPrompt?.trim()
  if (!systemPrompt) {
    return { ok: false, code: 'request_failed', message: 'Empty system prompt' }
  }

  const messages = payload.messages ?? []
  if (messages.length === 0) {
    return { ok: false, code: 'request_failed', message: 'No messages' }
  }

  const last = messages[messages.length - 1]
  if (last.role !== 'user' || !last.content.trim()) {
    return { ok: false, code: 'request_failed', message: 'Last message must be non-empty user' }
  }

  const textLlm = configManager.getTextLlmConfig()
  if (!textLlm.apiKey?.trim()) {
    return { ok: false, code: 'no_api_key', message: t('errors.commandNeedsTextLlm') }
  }

  const history = truncateChatHistory(messages.slice(0, -1))
  const latestUser = last.content.trim()

  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: latestUser },
  ]

  try {
    const generated = await generateTextWithTextLlm(textLlm, apiMessages)
    const content = generated.trim()
    if (!content) {
      return { ok: false, code: 'empty_response', message: 'Empty model response' }
    }
    return { ok: true, content }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, code: 'request_failed', message }
  }
}
