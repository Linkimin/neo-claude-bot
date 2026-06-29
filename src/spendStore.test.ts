import { describe, it, expect } from 'vitest'
import { SpendStore } from './spendStore.ts'

describe('SpendStore', () => {
  it('accumulates cost per project/day/provider', () => {
    const s = new SpendStore(':memory:')
    s.add('spike', 'claude', 0.10, '2026-06-29')
    s.add('spike', 'claude', 0.05, '2026-06-29')
    s.add('spike', 'fallback', 0.02, '2026-06-29')
    const rows = s.today('2026-06-29')
    expect(rows).toEqual([
      { project: 'spike', provider: 'claude', totalUsd: expect.closeTo(0.15, 5) },
      { project: 'spike', provider: 'fallback', totalUsd: expect.closeTo(0.02, 5) },
    ])
  })

  it('todayTotal sums across rows of the day', () => {
    const s = new SpendStore(':memory:')
    s.add('spike', 'claude', 0.10, '2026-06-29')
    s.add('game', 'claude', 0.20, '2026-06-29')
    s.add('spike', 'claude', 0.30, '2026-06-28') // другой день
    expect(s.todayTotal('2026-06-29')).toBeCloseTo(0.30, 5)
  })

  it('todayTotal is 0 for an empty day', () => {
    const s = new SpendStore(':memory:')
    expect(s.todayTotal('2026-06-29')).toBe(0)
  })
})
