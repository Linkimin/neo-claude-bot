import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TopicMap } from './topics.ts'

function fresh(): TopicMap { return new TopicMap(':memory:') }

describe('TopicMap (SQLite)', () => {
  it('set+get', () => {
    const t = fresh()
    t.set('foo', 100)
    expect(t.get('foo')).toBe(100)
    expect(t.get('missing')).toBeUndefined()
  })
  it('projectForThread is reverse lookup', () => {
    const t = fresh()
    t.set('foo', 100)
    t.set('bar', 200)
    expect(t.projectForThread(100)).toBe('foo')
    expect(t.projectForThread(999)).toBeNull()
  })
  it('set on existing project overwrites', () => {
    const t = fresh()
    t.set('foo', 100)
    t.set('foo', 200)
    expect(t.get('foo')).toBe(200)
  })
  it('remove drops the row', () => {
    const t = fresh()
    t.set('foo', 100)
    t.remove('foo')
    expect(t.get('foo')).toBeUndefined()
    expect(t.projectForThread(100)).toBeNull()
  })
})

describe('TopicMap.migrateFromJson', () => {
  it('imports topics.json into rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tmig-'))
    const p = join(dir, 'topics.json')
    writeFileSync(p, JSON.stringify({ spike: 11, game: 22 }))
    const t = fresh()
    const n = TopicMap.migrateFromJson(t, p)
    expect(n).toBe(2)
    expect(t.get('spike')).toBe(11)
    expect(t.get('game')).toBe(22)
  })
  it('is a no-op when table non-empty', () => {
    const t = fresh()
    t.set('existing', 1)
    const dir = mkdtempSync(join(tmpdir(), 'tmig-'))
    const p = join(dir, 'topics.json')
    writeFileSync(p, JSON.stringify({ spike: 11 }))
    expect(TopicMap.migrateFromJson(t, p)).toBe(0)
  })
})
