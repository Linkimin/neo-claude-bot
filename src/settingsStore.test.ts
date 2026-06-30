import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from './settingsStore.ts'

function fresh(): SettingsStore { return new SettingsStore(':memory:') }

describe('SettingsStore (SQLite)', () => {
  it('effective falls back to defaultMode + global defaults', () => {
    const s = fresh()
    const e = s.effective('spike', 'acceptEdits')
    expect(e.mode).toBe('acceptEdits')
    expect(e.model).toBeDefined()
    expect(e.effort).toBeDefined()
  })
  it('set merges patches across calls', () => {
    const s = fresh()
    s.set('spike', { model: 'claude-opus-4-8' })
    s.set('spike', { effort: 'high' })
    const e = s.effective('spike', 'default')
    expect(e.model).toBe('claude-opus-4-8')
    expect(e.effort).toBe('high')
    expect(e.mode).toBe('default')
  })
  it('remove deletes the per-project row', () => {
    const s = fresh()
    s.set('spike', { model: 'claude-opus-4-8' })
    s.remove('spike')
    const e = s.effective('spike', 'default')
    expect(e.model).not.toBe('claude-opus-4-8')
  })
})

describe('SettingsStore.migrateFromJson', () => {
  it('imports settings.json into rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smig-'))
    const p = join(dir, 'settings.json')
    writeFileSync(p, JSON.stringify({ spike: { model: 'claude-opus-4-8', effort: 'high' } }))
    const s = fresh()
    const n = SettingsStore.migrateFromJson(s, p)
    expect(n).toBe(1)
    const e = s.effective('spike', 'default')
    expect(e.model).toBe('claude-opus-4-8')
    expect(e.effort).toBe('high')
  })
  it('is a no-op when table non-empty', () => {
    const s = fresh()
    s.set('existing', { model: 'claude-opus-4-8' })
    const dir = mkdtempSync(join(tmpdir(), 'smig-'))
    const p = join(dir, 'settings.json')
    writeFileSync(p, JSON.stringify({ spike: { effort: 'high' } }))
    expect(SettingsStore.migrateFromJson(s, p)).toBe(0)
  })
})
