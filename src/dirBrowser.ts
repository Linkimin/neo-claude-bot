import { readdirSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'

export interface DirPage {
  total: number
  page: number
  perPage: number
  items: string[]
}

export function listSubdirs(dirPath: string, page: number, perPage: number): DirPage {
  const all = readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b))
  const start = page * perPage
  return { total: all.length, page, perPage, items: all.slice(start, start + perPage) }
}

export function resolveInsideRoot(root: string, currentPath: string, segment: string): string | null {
  const rootR = resolve(root)
  const target = resolve(currentPath, segment)
  const rel = relative(rootR, target)
  if (rel === '') return target
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}
