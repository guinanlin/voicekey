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

  it('strips bracket wechat command at end', () => {
    const result = parseVoiceCommandInput('测试一下，用微信输入测试一下。[小猪佩奇:微信]', commands)
    expect(result).toEqual({
      commandId: 'wechat',
      content: '测试一下，用微信输入测试一下。',
      trigger: '[小猪佩奇:微信]',
    })
  })

  it('strips bracket command with full-width colon', () => {
    const result = parseVoiceCommandInput('正文内容[小猪佩奇：总结]', commands)
    expect(result?.commandId).toBe('summary')
    expect(result?.content).toBe('正文内容')
    expect(result?.trigger).toBe('[小猪佩奇：总结]')
  })

  it('returns null when bracket command is not at end', () => {
    expect(parseVoiceCommandInput('[小猪佩奇:微信]测试一下', commands)).toBeNull()
  })

  it('returns null when bracket action is unknown', () => {
    expect(parseVoiceCommandInput('正文[小猪佩奇:未知]', commands)).toBeNull()
  })

  it('returns null when bracket has only trigger without content', () => {
    expect(parseVoiceCommandInput('[小猪佩奇:微信]', commands)).toBeNull()
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
