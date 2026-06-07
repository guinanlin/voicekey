import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VOICE_COMMANDS,
  getDefaultVoiceCommand,
  normalizeVoiceCommandsConfig,
  parseVoiceCommandInput,
} from './voice-commands'

describe('parseVoiceCommandInput', () => {
  const commands = DEFAULT_VOICE_COMMANDS

  it('returns null when no trigger matches', () => {
    expect(parseVoiceCommandInput('今天研究了一个 ERP Agent。', commands)).toBeNull()
  })

  it('strips summary trigger at end', () => {
    const result = parseVoiceCommandInput('今天研究了一个 ERP Agent。\n\n小猪佩奇总结', commands)
    expect(result).toEqual({
      commandId: 'summary',
      content: '今天研究了一个 ERP Agent。',
      trigger: '小猪佩奇总结',
    })
  })

  it('strips polish trigger with trailing spaces', () => {
    const result = parseVoiceCommandInput('客户这个东西现在做不了  小猪佩奇润色  ', commands)
    expect(result?.commandId).toBe('polish')
    expect(result?.content).toBe('客户这个东西现在做不了')
  })

  it('returns null when trigger is not at end', () => {
    expect(parseVoiceCommandInput('小猪佩奇总结今天的内容', commands)).toBeNull()
  })

  it('returns null when only trigger without content', () => {
    expect(parseVoiceCommandInput('小猪佩奇总结', commands)).toBeNull()
  })
})

describe('normalizeVoiceCommandsConfig', () => {
  it('returns defaults when empty', () => {
    const cfg = normalizeVoiceCommandsConfig(undefined)
    expect(cfg.commands).toHaveLength(6)
    expect(cfg.commands[0].id).toBe('polish')
  })

  it('merges user prompt overrides', () => {
    const cfg = normalizeVoiceCommandsConfig({
      commands: [{ id: 'polish', trigger: '小猪佩奇润色', prompt: 'custom prompt' }],
    })
    const polish = cfg.commands.find((c) => c.id === 'polish')
    expect(polish?.prompt).toBe('custom prompt')
    expect(cfg.commands).toHaveLength(6)
  })
})

describe('getDefaultVoiceCommand', () => {
  it('returns a copy of built-in command', () => {
    const def = getDefaultVoiceCommand('email')
    expect(def.trigger).toBe('小猪佩奇邮件')
    def.prompt = 'mutated'
    expect(getDefaultVoiceCommand('email').prompt).not.toBe('mutated')
  })
})
