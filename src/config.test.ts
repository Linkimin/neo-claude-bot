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

describe('loadConfig fallback', () => {
  const base = { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_USER_ID: '1', TELEGRAM_GROUP_ID: '-1', SETTINGS_PIN: '1' }

  it('fallback is null when ROUTERAI_API_KEY absent', () => {
    expect(loadConfig(base).fallback).toBeNull()
  })

  it('builds fallback config when key + base url present', () => {
    const cfg = loadConfig({ ...base, ROUTERAI_API_KEY: 'k', ROUTERAI_BASE_URL: 'https://routerai.ru/api/v1', CCR_PORT: '3456' })
    expect(cfg.fallback).toEqual({ apiKey: 'k', baseUrl: 'https://routerai.ru/api/v1', ccrPort: 3456, ccrUrl: 'http://localhost:3456' })
  })

  it('throws when key present but base url missing', () => {
    expect(() => loadConfig({ ...base, ROUTERAI_API_KEY: 'k' })).toThrow(/ROUTERAI_BASE_URL/)
  })

  it('defaults ccrPort to 3456', () => {
    const cfg = loadConfig({ ...base, ROUTERAI_API_KEY: 'k', ROUTERAI_BASE_URL: 'u' })
    expect(cfg.fallback!.ccrPort).toBe(3456)
  })
})

describe('loadConfig spend thresholds', () => {
  const base = { TELEGRAM_BOT_TOKEN: 'abc', TELEGRAM_USER_ID: '1', TELEGRAM_GROUP_ID: '-1', SETTINGS_PIN: '1' }

  it('null when not set', () => {
    const cfg = loadConfig(base)
    expect(cfg.spendAlertUsd).toBeNull()
    expect(cfg.routeraiBalanceMin).toBeNull()
  })
  it('parses numbers when set', () => {
    const cfg = loadConfig({ ...base, SPEND_ALERT_USD: '5', ROUTERAI_BALANCE_MIN: '3.5' })
    expect(cfg.spendAlertUsd).toBe(5)
    expect(cfg.routeraiBalanceMin).toBe(3.5)
  })
})
