import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('parses a valid env', () => {
    const cfg = loadConfig({ TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_USER_ID: '12345' })
    expect(cfg.botToken).toBe('abc')
    expect(cfg.allowedUserId).toBe(12345)
  })

  it('throws when token missing', () => {
    expect(() => loadConfig({ TELEGRAM_USER_ID: '12345' })).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  it('throws when user id missing or non-numeric', () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: 'abc' })).toThrow(/TELEGRAM_USER_ID/)
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_USER_ID: 'x' })).toThrow(/TELEGRAM_USER_ID/)
  })
})
