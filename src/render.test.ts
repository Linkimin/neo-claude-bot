import { describe, it, expect } from 'vitest'
import { truncate, toolUseLine, resultFooter } from './render.ts'

describe('render helpers', () => {
  it('truncate keeps short text as-is', () => {
    expect(truncate('hello', 100)).toBe('hello')
  })
  it('truncate cuts long text and adds marker', () => {
    const out = truncate('a'.repeat(50), 10)
    expect(out.length).toBeLessThanOrEqual(10 + 1) // ровно maxLen + символ '…'
    expect(out.endsWith('…')).toBe(true)
  })
  it('toolUseLine formats tool name', () => {
    expect(toolUseLine('Edit', { file_path: 'a.txt' })).toBe('🔧 Edit')
  })
  it('resultFooter for ok', () => {
    expect(resultFooter({ kind: 'result', ok: true, interrupted: false, sessionId: 's', costUsd: 0.1234, numTurns: 6 })).toBe('✅ готово · 6 turns · $0.1234')
  })
  it('resultFooter for error', () => {
    expect(resultFooter({ kind: 'result', ok: false, interrupted: false, sessionId: 's', costUsd: 0.01, numTurns: 2 })).toBe('❌ ошибка · 2 turns · $0.0100')
  })
})
