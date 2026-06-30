import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { listSubdirs, resolveInsideRoot } from './dirBrowser.ts'

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dirbrowser-'))
  for (const n of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india']) {
    mkdirSync(join(root, n))
  }
  mkdirSync(join(root, '.hidden'))
})
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

describe('listSubdirs', () => {
  it('returns sorted dirs, skipping dotfiles', () => {
    const p = listSubdirs(root, 0, 50)
    expect(p.items).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'])
    expect(p.total).toBe(9)
  })
  it('paginates', () => {
    const p1 = listSubdirs(root, 0, 4)
    expect(p1.items).toEqual(['alpha', 'bravo', 'charlie', 'delta'])
    expect(p1.total).toBe(9)
    const p2 = listSubdirs(root, 1, 4)
    expect(p2.items).toEqual(['echo', 'foxtrot', 'golf', 'hotel'])
    const p3 = listSubdirs(root, 2, 4)
    expect(p3.items).toEqual(['india'])
  })
})

describe('resolveInsideRoot', () => {
  it('returns resolved path when segment stays inside the root', () => {
    expect(resolveInsideRoot(root, root, 'alpha')).toBe(resolve(root, 'alpha'))
    expect(resolveInsideRoot(root, join(root, 'alpha'), '..')).toBe(resolve(root))
  })
  it('returns null when target leaves the root', () => {
    expect(resolveInsideRoot(root, root, '..')).toBeNull()
    expect(resolveInsideRoot(root, root, '../..')).toBeNull()
  })
  it('returns null when segment is an absolute path outside the root', () => {
    expect(resolveInsideRoot(root, root, resolve(tmpdir(), 'other'))).toBeNull()
  })
})
