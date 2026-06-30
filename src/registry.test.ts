import { describe, it, expect } from 'vitest'
import { Registry } from './registry.ts'
import { ProjectStore } from './projectStore.ts'

function ready(): { store: ProjectStore; reg: Registry } {
  const store = new ProjectStore(':memory:')
  store.add({ slug: 'foo', label: 'Foo', dir: 'D:/x/foo', defaultMode: 'acceptEdits', threadId: 1 })
  store.add({ slug: 'bar', label: 'Bar', dir: 'D:/x/bar', defaultMode: 'default', threadId: 2 })
  return { store, reg: new Registry(store) }
}

describe('Registry (adapter)', () => {
  it('names() returns slugs in store order', () => {
    expect(ready().reg.names()).toEqual(['foo', 'bar'])
  })
  it('get(slug) returns Project shape consumed by Core/bot', () => {
    const p = ready().reg.get('foo')
    expect(p).toEqual({ name: 'foo', dir: 'D:/x/foo', defaultMode: 'acceptEdits' })
  })
  it('get throws on unknown', () => {
    expect(() => ready().reg.get('nope')).toThrow(/unknown project/)
  })
})
