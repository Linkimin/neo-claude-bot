import { describe, it, expect } from 'vitest'
import { toSlug, dedupeSlug } from './slug.ts'

describe('toSlug', () => {
  it('lowercases and replaces whitespace with dashes', () => {
    expect(toSlug('My Cool Project')).toBe('my-cool-project')
  })
  it('strips punctuation', () => {
    expect(toSlug('Hello, world!!!')).toBe('hello-world')
  })
  it('handles cyrillic letters (kept as-is, lowercased)', () => {
    expect(toSlug('Мой Проект')).toBe('мой-проект')
  })
  it('trims edge dashes', () => {
    expect(toSlug('  --foo--  ')).toBe('foo')
  })
  it('falls back to "project" when input has no letters/digits', () => {
    expect(toSlug('***')).toBe('project')
    expect(toSlug('')).toBe('project')
  })
  it('caps length at 40 chars', () => {
    expect(toSlug('a'.repeat(80))).toHaveLength(40)
  })
})

describe('dedupeSlug', () => {
  it('returns slug as-is when not taken', () => {
    expect(dedupeSlug('foo', new Set())).toBe('foo')
  })
  it('appends -2 on first collision', () => {
    expect(dedupeSlug('foo', new Set(['foo']))).toBe('foo-2')
  })
  it('keeps incrementing until free', () => {
    expect(dedupeSlug('foo', new Set(['foo', 'foo-2', 'foo-3']))).toBe('foo-4')
  })
})
