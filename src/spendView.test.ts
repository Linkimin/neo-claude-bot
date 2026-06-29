import { describe, it, expect } from 'vitest'
import { renderSpend } from './spendView.ts'

describe('renderSpend', () => {
  it('shows rows, total and routerai balance', () => {
    const text = renderSpend(
      [
        { project: 'spike', provider: 'claude', totalUsd: 0.15 },
        { project: 'spike', provider: 'fallback', totalUsd: 0.02 },
      ],
      22.77,
    )
    expect(text).toContain('spike')
    expect(text).toContain('claude')
    expect(text).toContain('$0.15')
    expect(text).toContain('Итого')
    expect(text).toContain('22.77')
  })
  it('handles no balance and empty rows', () => {
    const text = renderSpend([], null)
    expect(text).toContain('сегодня трат нет')
  })
})
