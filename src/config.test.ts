import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.ts'

const base = { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_USER_ID: '12345', TELEGRAM_GROUP_ID: '-1001999', SETTINGS_PIN: '1234' }

describe('loadConfig', () => {
  it('parses a valid env', () => {
    const cfg = loadConfig(base)
    expect(cfg.botToken).toBe('abc')
    expect(cfg.allowedUserId).toBe(12345)
    expect(cfg.groupId).toBe(-1001999)
    expect(cfg.pin).toBe('1234')
  })

  it('throws when token missing', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_BOT_TOKEN: undefined })).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  it('throws when user id missing or non-numeric', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_USER_ID: undefined })).toThrow(/TELEGRAM_USER_ID/)
    expect(() => loadConfig({ ...base, TELEGRAM_USER_ID: 'x' })).toThrow(/TELEGRAM_USER_ID/)
  })

  it('throws when group id missing or non-numeric', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_GROUP_ID: undefined })).toThrow(/TELEGRAM_GROUP_ID/)
    expect(() => loadConfig({ ...base, TELEGRAM_GROUP_ID: 'x' })).toThrow(/TELEGRAM_GROUP_ID/)
  })

  it('throws when pin missing', () => {
    expect(() => loadConfig({ ...base, SETTINGS_PIN: undefined })).toThrow(/SETTINGS_PIN/)
  })
})
