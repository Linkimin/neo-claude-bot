import { describe, it, expect } from 'vitest'
import { renderToolUse, renderDiff } from './toolRender.ts'

describe('renderDiff', () => {
  it('shows removed and added lines in a <pre>', () => {
    const out = renderDiff('old1\nold2', 'new1')
    expect(out).toContain('<pre>')
    expect(out).toContain('- old1')
    expect(out).toContain('- old2')
    expect(out).toContain('+ new1')
  })
  it('escapes html in diff content', () => {
    expect(renderDiff('a < b', 'a > b')).toContain('- a &lt; b')
  })
  it('caps very long sides', () => {
    const out = renderDiff(Array.from({ length: 50 }, (_v, i) => `l${i}`).join('\n'), 'x', 10)
    expect(out).toContain('… ')
  })
})

describe('renderToolUse', () => {
  it('Bash shows the command in a pre block', () => {
    const out = renderToolUse('Bash', { command: 'ls -la' })
    expect(out).toContain('Bash')
    expect(out).toContain('<pre>ls -la</pre>')
  })
  it('Read/Write show the path as code', () => {
    expect(renderToolUse('Read', { file_path: 'D:/x/a.ts' })).toContain('<code>D:/x/a.ts</code>')
    expect(renderToolUse('Write', { file_path: 'D:/x/b.ts' })).toContain('<code>D:/x/b.ts</code>')
  })
  it('Edit shows path and a diff', () => {
    const out = renderToolUse('Edit', { file_path: 'a.ts', old_string: 'foo', new_string: 'bar' })
    expect(out).toContain('<code>a.ts</code>')
    expect(out).toContain('- foo')
    expect(out).toContain('+ bar')
  })
  it('Grep shows the pattern', () => {
    expect(renderToolUse('Grep', { pattern: 'TODO' })).toContain('<code>TODO</code>')
  })
  it('unknown tool shows name + truncated json, escaped', () => {
    const out = renderToolUse('Weird', { a: '<x>' })
    expect(out).toContain('Weird')
    expect(out).toContain('&lt;x&gt;')
  })
  it('escapes a path containing angle brackets', () => {
    expect(renderToolUse('Read', { file_path: 'a<b>.ts' })).toContain('a&lt;b&gt;.ts')
  })
})
