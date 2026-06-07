import { describe, expect, it } from 'vitest'
import { CRAFTSMAN_CHAT_MAX_ROUNDS, truncateChatHistory } from '../shared/craftsman-chat-utils'
import type { CraftsmanChatMessage } from '../shared/types'

function makeHistory(rounds: number): CraftsmanChatMessage[] {
  const msgs: CraftsmanChatMessage[] = []
  for (let i = 1; i <= rounds; i++) {
    msgs.push({ role: 'user', content: `user-${i}` })
    msgs.push({ role: 'assistant', content: `assistant-${i}` })
  }
  return msgs
}

describe('truncateChatHistory', () => {
  it('returns all messages when within limit', () => {
    const history = makeHistory(5)
    expect(truncateChatHistory(history)).toEqual(history)
  })

  it('keeps last 10 rounds when 12 rounds provided', () => {
    const history = makeHistory(12)
    const truncated = truncateChatHistory(history)
    expect(truncated).toHaveLength(CRAFTSMAN_CHAT_MAX_ROUNDS * 2)
    expect(truncated[0].content).toBe('user-3')
    expect(truncated[1].content).toBe('assistant-3')
    expect(truncated[truncated.length - 1].content).toBe('assistant-12')
  })

  it('respects custom maxRounds', () => {
    const history = makeHistory(5)
    const truncated = truncateChatHistory(history, 2)
    expect(truncated).toHaveLength(4)
    expect(truncated[0].content).toBe('user-4')
  })
})
