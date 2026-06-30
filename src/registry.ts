import type { ProjectStore } from './projectStore.ts'

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default'

export interface Project {
  name: string
  dir: string
  defaultMode: PermissionMode
}

// Тонкий адаптер над ProjectStore: сохраняет контракт get(slug)/names() для Core/bot.
// ProjectStore — источник истины (slug == ключ роутинга, как раньше name).
export class Registry {
  constructor(private readonly store: ProjectStore) {}

  get(name: string): Project {
    const row = this.store.get(name)
    if (!row) throw new Error(`unknown project: ${name}`)
    return { name: row.slug, dir: row.dir, defaultMode: row.defaultMode }
  }

  names(): string[] {
    return this.store.list().map((p) => p.slug)
  }
}
