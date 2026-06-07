import type { CraftsmanChatMessage } from './types'

export const CRAFTSMAN_CHAT_MAX_ROUNDS = 10

/** 保留最近 maxRounds 轮（每轮 user+assistant，最多 2*maxRounds 条） */
export function truncateChatHistory(
  messages: CraftsmanChatMessage[],
  maxRounds = CRAFTSMAN_CHAT_MAX_ROUNDS,
): CraftsmanChatMessage[] {
  const maxMessages = maxRounds * 2
  if (messages.length <= maxMessages) return messages
  return messages.slice(-maxMessages)
}
