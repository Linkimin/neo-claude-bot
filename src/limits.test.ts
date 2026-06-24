import { describe, it, expect } from 'vitest'
import { classifyLimit, formatReset, renderLimits } from './limits.ts'

describe('classifyLimit', () => {
  it('ok for allowed', () => { expect(classifyLimit('allowed')).toBe('ok') })
  it('warning for allowed_warning', () => { expect(classifyLimit('allowed_warning')).toBe('warning') })
  it('blocked for rejected/blocked/exceeded', () => {
    expect(classifyLimit('rejected')).toBe('blocked')
    expect(classifyLimit('blocked')).toBe('blocked')
    expect(classifyLimit('limit_exceeded')).toBe('blocked')
  })
  it('unknown statuses default to ok (no false queueing)', () => {
    expect(classifyLimit('something_new')).toBe('ok')
  })
})

describe('formatReset', () => {
  it('shows relative time for the future', () => {
    const now = 1_000_000_000_000
    const out = formatReset(1_000_000_000 + 3720, now) // +62 минуты
    expect(out).toMatch(/через 1ч 2м/)
  })
  it('says сейчас for the past', () => {
    expect(formatReset(1000, 5_000_000_000_000)).toBe('сейчас')
  })
})

describe('renderLimits', () => {
  it('says no data when empty', () => {
    expect(renderLimits([], Date.now())).toContain('данных пока нет')
  })
  it('renders percent and window labels', () => {
    const now = 1_000_000_000_000
    const text = renderLimits(
      [{ window: 'five_hour', utilization: 0.72, resetsAt: 1_000_000_000 + 600, status: 'allowed_warning' }],
      now,
    )
    expect(text).toContain('5-часовое')
    expect(text).toContain('72%')
  })
})
