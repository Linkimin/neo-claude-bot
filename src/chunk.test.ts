import { describe, it, expect } from 'vitest'
import { splitForTelegram } from './chunk.ts'

describe('splitForTelegram', () => {
  it('returns one chunk when within limit', () => {
    expect(splitForTelegram('short', 4096)).toEqual(['short'])
  })
  it('splits long plain text into chunks within the limit', () => {
    const line = 'x'.repeat(100)
    const text = Array.from({ length: 100 }, () => line).join('\n') // ~10100 chars
    const chunks = splitForTelegram(text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000)
    expect(chunks.join('\n')).toBe(text)
  })
  it('keeps <pre> balanced when a code block straddles a chunk boundary', () => {
    const body = Array.from({ length: 40 }, (_v, i) => `line ${i}`).join('\n')
    const html = `<pre>${body}</pre>`
    const chunks = splitForTelegram(html, 120)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      const opens = (c.match(/<pre>/g) ?? []).length
      const closes = (c.match(/<\/pre>/g) ?? []).length
      expect(opens).toBe(closes)
    }
  })
  it('never emits an empty chunk', () => {
    const chunks = splitForTelegram('a\n'.repeat(50), 30)
    for (const c of chunks) expect(c.length).toBeGreaterThan(0)
  })
})
