import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import type { PermissionMode } from './registry.ts'

export interface ProjectRow {
  slug: string
  label: string
  dir: string
  defaultMode: PermissionMode
  threadId: number | null
  createdAt: number
}

export interface RootRow {
  path: string
  addedAt: number
}

export class ProjectStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        slug         TEXT PRIMARY KEY,
        label        TEXT NOT NULL,
        dir          TEXT NOT NULL,
        default_mode TEXT NOT NULL,
        thread_id    INTEGER,
        created_at   INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_roots (
        path     TEXT PRIMARY KEY,
        added_at INTEGER NOT NULL
      );
    `)
  }

  list(): ProjectRow[] {
    return this.db
      .prepare('SELECT slug, label, dir, default_mode AS defaultMode, thread_id AS threadId, created_at AS createdAt FROM projects ORDER BY rowid')
      .all() as ProjectRow[]
  }

  get(slug: string): ProjectRow | undefined {
    return this.db
      .prepare('SELECT slug, label, dir, default_mode AS defaultMode, thread_id AS threadId, created_at AS createdAt FROM projects WHERE slug = ?')
      .get(slug) as ProjectRow | undefined
  }

  isSlugTaken(slug: string): boolean {
    return this.db.prepare('SELECT 1 FROM projects WHERE slug = ?').get(slug) !== undefined
  }

  isDirTaken(dir: string): boolean {
    return this.db.prepare('SELECT 1 FROM projects WHERE dir = ?').get(dir) !== undefined
  }

  add(p: Omit<ProjectRow, 'createdAt'>): void {
    this.db
      .prepare('INSERT INTO projects (slug, label, dir, default_mode, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.slug, p.label, p.dir, p.defaultMode, p.threadId, Date.now())
  }

  rename(slug: string, label: string): void {
    this.db.prepare('UPDATE projects SET label = ? WHERE slug = ?').run(label, slug)
  }

  setThreadId(slug: string, threadId: number): void {
    this.db.prepare('UPDATE projects SET thread_id = ? WHERE slug = ?').run(threadId, slug)
  }

  remove(slug: string): void {
    this.db.prepare('DELETE FROM projects WHERE slug = ?').run(slug)
  }

  roots(): RootRow[] {
    return this.db
      .prepare('SELECT path, added_at AS addedAt FROM project_roots ORDER BY rowid')
      .all() as RootRow[]
  }

  addRoot(path: string): void {
    this.db
      .prepare('INSERT INTO project_roots (path, added_at) VALUES (?, ?) ON CONFLICT(path) DO NOTHING')
      .run(path, Date.now())
  }

  removeRoot(path: string): void {
    this.db.prepare('DELETE FROM project_roots WHERE path = ?').run(path)
  }

  close(): void {
    this.db.close()
  }

  static migrateFromJson(
    store: ProjectStore,
    paths: { projectsJson: string | null; topicsJson: string | null },
  ): number {
    if (store.list().length > 0) return 0
    if (!paths.projectsJson || !existsSync(paths.projectsJson)) return 0
    const projects = JSON.parse(readFileSync(paths.projectsJson, 'utf8')) as Array<{ name: string; dir: string; defaultMode: PermissionMode }>
    const topics: Record<string, number> =
      paths.topicsJson && existsSync(paths.topicsJson)
        ? JSON.parse(readFileSync(paths.topicsJson, 'utf8'))
        : {}
    let count = 0
    for (const p of projects) {
      store.add({ slug: p.name, label: p.name, dir: p.dir, defaultMode: p.defaultMode, threadId: topics[p.name] ?? null })
      count++
    }
    return count
  }
}
