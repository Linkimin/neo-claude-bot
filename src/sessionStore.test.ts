import { describe, it, expect } from 'vitest'
import { SessionStore } from './sessionStore.ts'

describe('SessionStore', () => {
  it('returns undefined for unknown project', () => {
    const s = new SessionStore(':memory:')
    expect(s.getSessionId('spike')).toBeUndefined()
  })

  it('set then get', () => {
    const s = new SessionStore(':memory:')
    s.setSession('spike', 's1')
    expect(s.getSessionId('spike')).toBe('s1')
  })

  it('set upserts (overwrites previous session id)', () => {
    const s = new SessionStore(':memory:')
    s.setSession('spike', 's1')
    s.setSession('spike', 's2')
    expect(s.getSessionId('spike')).toBe('s2')
  })

  it('clear removes the session', () => {
    const s = new SessionStore(':memory:')
    s.setSession('spike', 's1')
    s.clear('spike')
    expect(s.getSessionId('spike')).toBeUndefined()
  })

  it('list returns rows sorted by project', () => {
    const s = new SessionStore(':memory:')
    s.setSession('spike', 's1')
    s.setSession('game', 's2')
    expect(s.list().map((r) => r.project)).toEqual(['game', 'spike'])
  })
})
