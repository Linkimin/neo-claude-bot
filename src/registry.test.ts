import { describe, it, expect } from 'vitest'
import { Registry } from './registry.ts'

const projects = [
  { name: 'spike', dir: 'tmp/spike-project', defaultMode: 'bypassPermissions' as const },
  { name: 'game', dir: 'tmp/game', defaultMode: 'acceptEdits' as const },
]

describe('Registry', () => {
  it('returns a project by name', () => {
    const r = new Registry(projects)
    expect(r.get('game').dir).toBe('tmp/game')
  })

  it('lists all project names', () => {
    const r = new Registry(projects)
    expect(r.names()).toEqual(['spike', 'game'])
  })

  it('throws on unknown project', () => {
    const r = new Registry(projects)
    expect(() => r.get('nope')).toThrow(/unknown project: nope/)
  })
})
