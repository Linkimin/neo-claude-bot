import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'
import type { PermissionMode } from './registry.ts'
import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_FALLBACK_MODEL, type ProjectSettings } from './settings.ts'

// Персист частичных переопределений настроек per-project в SQLite.
// effective() склеивает их с дефолтами.
export class SettingsStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        slug TEXT PRIMARY KEY,
        json TEXT NOT NULL
      )
    `)
  }

  effective(project: string, defaultMode: PermissionMode): ProjectSettings {
    const row = this.db.prepare('SELECT json FROM settings WHERE slug = ?').get(project) as { json: string } | undefined
    const o: Partial<ProjectSettings> = row ? JSON.parse(row.json) : {}
    return {
      mode: o.mode ?? defaultMode,
      model: o.model ?? DEFAULT_MODEL,
      effort: o.effort ?? DEFAULT_EFFORT,
      fallbackModel: o.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
      autoFailover: o.autoFailover ?? false,
    }
  }

  set(project: string, patch: Partial<ProjectSettings>): void {
    const row = this.db.prepare('SELECT json FROM settings WHERE slug = ?').get(project) as { json: string } | undefined
    const merged: Partial<ProjectSettings> = { ...(row ? JSON.parse(row.json) : {}), ...patch }
    this.db
      .prepare('INSERT INTO settings (slug, json) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET json = excluded.json')
      .run(project, JSON.stringify(merged))
  }

  remove(project: string): void {
    this.db.prepare('DELETE FROM settings WHERE slug = ?').run(project)
  }

  close(): void {
    this.db.close()
  }

  static migrateFromJson(store: SettingsStore, jsonPath: string): number {
    const existing = store.db.prepare('SELECT 1 FROM settings LIMIT 1').get()
    if (existing) return 0
    if (!existsSync(jsonPath)) return 0
    const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, Partial<ProjectSettings>>
    let n = 0
    for (const [slug, patch] of Object.entries(data)) {
      store.set(slug, patch)
      n++
    }
    return n
  }
}
