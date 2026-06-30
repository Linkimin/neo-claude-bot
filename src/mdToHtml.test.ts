import { describe, it, expect } from 'vitest'
import { esc, mdToHtml } from './mdToHtml.ts'

describe('esc', () => {
  it('escapes the three HTML-significant chars only', () => {
    expect(esc('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
    expect(esc('quotes " and \' stay')).toBe('quotes " and \' stay')
  })
})

describe('mdToHtml', () => {
  it('bold (** and __)', () => {
    expect(mdToHtml('a **b** c')).toBe('a <b>b</b> c')
    expect(mdToHtml('a __b__ c')).toBe('a <b>b</b> c')
  })
  it('italic (* and _), but not snake_case', () => {
    expect(mdToHtml('a *b* c')).toBe('a <i>b</i> c')
    expect(mdToHtml('say _hi_ now')).toBe('say <i>hi</i> now')
    expect(mdToHtml('some_snake_case_name')).toBe('some_snake_case_name')
  })
  it('strikethrough', () => {
    expect(mdToHtml('~~gone~~')).toBe('<s>gone</s>')
  })
  it('inline code is escaped and wrapped', () => {
    expect(mdToHtml('use `a < b` here')).toBe('use <code>a &lt; b</code> here')
  })
  it('fenced code: escaped, no inner formatting, lang stripped', () => {
    expect(mdToHtml('```js\n**x** < y\n```')).toBe('<pre>**x** &lt; y</pre>')
  })
  it('headings become bold', () => {
    expect(mdToHtml('# Title')).toBe('<b>Title</b>')
    expect(mdToHtml('### Sub')).toBe('<b>Sub</b>')
  })
  it('links', () => {
    expect(mdToHtml('[grammY](https://grammy.dev)')).toBe('<a href="https://grammy.dev">grammY</a>')
  })
  it('bullets become •', () => {
    expect(mdToHtml('- one\n- two')).toBe('• one\n• two')
  })
  it('escapes stray angle brackets in prose', () => {
    expect(mdToHtml('1 < 2 and a & b')).toBe('1 &lt; 2 and a &amp; b')
  })
  it('does not throw on malformed markdown', () => {
    expect(() => mdToHtml('```unclosed\n*stray and [bad](')).not.toThrow()
  })
})
