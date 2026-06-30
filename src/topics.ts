import Database from 'better-sqlite3'
import { existsSync, readFileSync } from 'node:fs'

// Карта slug проекта -> message_thread_id форум-топика (SQLite-стор).
export class TopicMap {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS topics (
        slug      TEXT PRIMARY KEY,
        thread_id INTEGER NOT NULL
      )
    `)
  }

  get(project: string): number | undefined {
    const row = this.db.prepare('SELECT thread_id AS threadId FROM topics WHERE slug = ?').get(project) as { threadId: number } | undefined
    return row?.threadId
  }

  projectForThread(threadId: number): string | null {
    const row = this.db.prepare('SELECT slug FROM topics WHERE thread_id = ?').get(threadId) as { slug: string } | undefined
    return row?.slug ?? null
  }

  set(project: string, threadId: number): void {
    this.db
      .prepare('INSERT INTO topics (slug, thread_id) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET thread_id = excluded.thread_id')
      .run(project, threadId)
  }

  remove(project: string): void {
    this.db.prepare('DELETE FROM topics WHERE slug = ?').run(project)
  }

  close(): void {
    this.db.close()
  }

  static migrateFromJson(store: TopicMap, jsonPath: string): number {
    const existing = store.db.prepare('SELECT 1 FROM topics LIMIT 1').get()
    if (existing) return 0
    if (!existsSync(jsonPath)) return 0
    const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, number>
    let n = 0
    for (const [slug, tid] of Object.entries(data)) {
      store.set(slug, tid)
      n++
    }
    return n
  }
}
