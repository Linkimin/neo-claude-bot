import { describe, it, expect } from 'vitest'
import {
  MODELS, DEFAULT_MODEL, EFFORTS, EFFORT_THINKING, DEFAULT_EFFORT,
  parseSettingAction, settingPatch, renderSettings, checkPin,
} from './settings.ts'

describe('settings constants', () => {
  it('has 3 models and a valid default', () => {
    expect(MODELS.map((m) => m.id)).toEqual(['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'])
    expect(MODELS.some((m) => m.id === DEFAULT_MODEL)).toBe(true)
  })
  it('maps every effort level to a thinking budget', () => {
    expect(EFFORTS).toEqual(['low', 'medium', 'high', 'max'])
    for (const e of EFFORTS) expect(EFFORT_THINKING[e]).toBeGreaterThan(0)
    expect(EFFORT_THINKING.low).toBeLessThan(EFFORT_THINKING.max)
    expect(EFFORTS.includes(DEFAULT_EFFORT)).toBe(true)
  })
})

describe('parseSettingAction', () => {
  it('parses model/effort/mode actions', () => {
    expect(parseSettingAction('set:model:claude-opus-4-8')).toEqual({ kind: 'model', value: 'claude-opus-4-8' })
    expect(parseSettingAction('set:effort:high')).toEqual({ kind: 'effort', value: 'high' })
    expect(parseSettingAction('set:mode:acceptEdits')).toEqual({ kind: 'mode', value: 'acceptEdits' })
  })
  it('returns null for junk', () => {
    expect(parseSettingAction('nonsense')).toBeNull()
    expect(parseSettingAction('set:foo:bar')).toBeNull()
  })
})

describe('settingPatch (validation)', () => {
  it('accepts known model/effort/mode', () => {
    expect(settingPatch({ kind: 'model', value: 'claude-opus-4-8' })).toEqual({ model: 'claude-opus-4-8' })
    expect(settingPatch({ kind: 'effort', value: 'max' })).toEqual({ effort: 'max' })
    expect(settingPatch({ kind: 'mode', value: 'acceptEdits' })).toEqual({ mode: 'acceptEdits' })
    expect(settingPatch({ kind: 'mode', value: 'default' })).toEqual({ mode: 'default' })
  })
  it('rejects unknown values and auto via buttons', () => {
    expect(settingPatch({ kind: 'model', value: 'gpt-4' })).toBeNull()
    expect(settingPatch({ kind: 'effort', value: 'ultra' })).toBeNull()
    expect(settingPatch({ kind: 'mode', value: 'bypassPermissions' })).toBeNull() // auto только через /auto <PIN>
  })
})

describe('renderSettings', () => {
  it('shows human-readable model label and values', () => {
    const text = renderSettings({ mode: 'acceptEdits', model: 'claude-opus-4-8', effort: 'high' })
    expect(text).toContain('Opus 4.8')
    expect(text).toContain('acceptEdits')
    expect(text).toContain('high')
  })
})

describe('checkPin', () => {
  it('matches trimmed pin', () => {
    expect(checkPin(' 1234 ', '1234')).toBe(true)
    expect(checkPin('0000', '1234')).toBe(false)
  })
})
