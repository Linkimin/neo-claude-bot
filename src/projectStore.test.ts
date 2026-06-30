import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectStore } from './projectStore.ts'

function fresh(): ProjectStore { return new ProjectStore(':memory:') }

describe('ProjectStore — projects', () => {
  it('add+get+list', () => {
    const s = fresh()
    s.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'acceptEdits', threadId: 10 })
    expect(s.get('foo')).toMatchObject({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'acceptEdits', threadId: 10 })
    expect(s.list().map((p) => p.slug)).toEqual(['foo'])
  })
  it('isSlugTaken / isDirTaken', () => {
    const s = fresh()
    s.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'default', threadId: null })
    expect(s.isSlugTaken('foo')).toBe(true)
    expect(s.isSlugTaken('bar')).toBe(false)
    expect(s.isDirTaken('D:/x/foo')).toBe(true)
    expect(s.isDirTaken('D:/x/bar')).toBe(false)
  })
  it('rename only changes label', () => {
    const s = fresh()
    s.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'default', threadId: null })
    s.rename('foo', 'Foo v2')
    expect(s.get('foo')?.label).toBe('Foo v2')
    expect(s.get('foo')?.dir).toBe('D:/x/foo')
  })
  it('setThreadId updates only that column', () => {
    const s = fresh()
    s.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'default', threadId: null })
    s.setThreadId('foo', 42)
    expect(s.get('foo')?.threadId).toBe(42)
  })
  it('remove deletes the row', () => {
    const s = fresh()
    s.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'default', threadId: null })
    s.remove('foo')
    expect(s.get('foo')).toBeUndefined()
    expect(s.list()).toEqual([])
  })
})

describe('ProjectStore — roots', () => {
  it('addRoot+roots is ordered by added_at then path', () => {
    const s = fresh()
    s.addRoot('D:/work')
    s.addRoot('D:/play')
    expect(s.roots().map((r) => r.path)).toEqual(['D:/work', 'D:/play'])
  })
  it('addRoot is idempotent', () => {
    const s = fresh()
    s.addRoot('D:/work')
    s.addRoot('D:/work')
    expect(s.roots()).toHaveLength(1)
  })
  it('removeRoot drops it', () => {
    const s = fresh()
    s.addRoot('D:/work')
    s.removeRoot('D:/work')
    expect(s.roots()).toEqual([])
  })
})

describe('ProjectStore.migrateFromJson', () => {
  function tmp(name: string, content: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    const p = join(dir, name)
    writeFileSync(p, JSON.stringify(content))
    return p
  }

  it('imports projects.json + topics.json into rows', () => {
    const projectsPath = tmp('projects.json', [
      { name: 'spike', dir: 'D:/x/spike', defaultMode: 'bypassPermissions' },
      { name: 'game', dir: 'D:/x/game', defaultMode: 'acceptEdits' },
    ])
    const topicsPath = tmp('topics.json', { spike: 11, game: 22 })
    const s = fresh()
    const n = ProjectStore.migrateFromJson(s, { projectsJson: projectsPath, topicsJson: topicsPath })
    expect(n).toBe(2)
    expect(s.get('spike')).toMatchObject({ slug: 'spike', label: 'spike', dir: 'D:/x/spike', defaultMode: 'bypassPermissions', threadId: 11 })
    expect(s.get('game')).toMatchObject({ slug: 'game', dir: 'D:/x/game', threadId: 22 })
  })

  it('is a no-op when projects table is non-empty', () => {
    const projectsPath = tmp('projects.json', [{ name: 'spike', dir: 'D:/x/spike', defaultMode: 'default' }])
    const s = fresh()
    s.add({ slug: 'existing', label: 'existing', dir: 'D:/x/existing', defaultMode: 'default', threadId: null })
    const n = ProjectStore.migrateFromJson(s, { projectsJson: projectsPath, topicsJson: null })
    expect(n).toBe(0)
    expect(s.list()).toHaveLength(1)
  })

  it('skips when projects.json is missing', () => {
    const s = fresh()
    const n = ProjectStore.migrateFromJson(s, { projectsJson: '/no/such/path.json', topicsJson: null })
    expect(n).toBe(0)
    expect(s.list()).toEqual([])
  })
})
