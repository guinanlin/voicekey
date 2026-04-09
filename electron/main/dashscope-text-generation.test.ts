import { describe, expect, it } from 'vitest'
import {
  generateTextWithTextLlm,
  isLegacyDashScopeTextGenerationUrl,
  parseDashScopeTextGenerationOutput,
  parseOpenAiCompatibleChatContent,
} from './dashscope-text-generation'

describe('parseDashScopeTextGenerationOutput', () => {
  it('returns empty for invalid payloads', () => {
    expect(parseDashScopeTextGenerationOutput(null)).toBe('')
    expect(parseDashScopeTextGenerationOutput({})).toBe('')
    expect(parseDashScopeTextGenerationOutput({ output: {} })).toBe('')
  })

  it('reads string content', () => {
    const data = {
      output: {
        choices: [{ message: { content: '  hello  ' } }],
      },
    }
    expect(parseDashScopeTextGenerationOutput(data)).toBe('hello')
  })

  it('joins array text parts', () => {
    const data = {
      output: {
        choices: [
          {
            message: {
              content: [{ text: 'a ' }, { text: 'b' }],
            },
          },
        ],
      },
    }
    expect(parseDashScopeTextGenerationOutput(data)).toBe('ab')
  })

  it('ignores empty text segments in array', () => {
    const data = {
      output: {
        choices: [{ message: { content: [{ text: '   ' }, { text: 'x' }] } }],
      },
    }
    expect(parseDashScopeTextGenerationOutput(data)).toBe('x')
  })
})

describe('isLegacyDashScopeTextGenerationUrl', () => {
  it('detects legacy text-generation path', () => {
    expect(
      isLegacyDashScopeTextGenerationUrl(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      ),
    ).toBe(true)
    expect(
      isLegacyDashScopeTextGenerationUrl(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      ),
    ).toBe(false)
  })
})

describe('parseOpenAiCompatibleChatContent', () => {
  it('reads top-level choices string content', () => {
    const data = {
      choices: [{ message: { content: '  summary  ' } }],
    }
    expect(parseOpenAiCompatibleChatContent(data)).toBe('summary')
  })

  it('joins array text parts like multimodal fragments', () => {
    const data = {
      choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }],
    }
    expect(parseOpenAiCompatibleChatContent(data)).toBe('ab')
  })
})

describe('generateTextWithTextLlm', () => {
  it('rejects empty API key without network', async () => {
    await expect(
      generateTextWithTextLlm({ model: 'qwen3.5-flash', region: 'cn', apiKey: '   ' }, [
        { role: 'user', content: 'hi' },
      ]),
    ).rejects.toThrow(/API key is empty/)
  })
})
