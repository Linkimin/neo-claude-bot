import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync } from 'node:fs'
import { SettingsStore } from './settingsStore.ts'

const TMP = 'tmp/settings-test.json'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

describe('SettingsStore', () => {
  it('effective() returns defaults when nothing stored', () => {
    const s = SettingsStore.load(TMP)
    expect(s.effective('spike', 'bypassPermissions')).toEqual({
      mode: 'bypassPermissions', model: 'claude-sonnet-4-6', effort: 'medium',
    })
  })

  it('set() persists a partial override and merges with defaults', () => {
    const s = SettingsStore.load(TMP)
    s.set('spike', { model: 'claude-opus-4-8' })
    s.set('spike', { effort: 'high' })
    expect(s.effective('spike', 'acceptEdits')).toEqual({
      mode: 'acceptEdits', model: 'claude-opus-4-8', effort: 'high',
    })
  })

  it('reloads persisted overrides from disk', () => {
    const s = SettingsStore.load(TMP)
    s.set('game', { mode: 'bypassPermissions', model: 'claude-haiku-4-5-20251001', effort: 'max' })
    const reloaded = SettingsStore.load(TMP)
    expect(reloaded.effective('game', 'default')).toEqual({
      mode: 'bypassPermissions', model: 'claude-haiku-4-5-20251001', effort: 'max',
    })
  })
})
