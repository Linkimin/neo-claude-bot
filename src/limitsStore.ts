import Database from 'better-sqlite3'
import type { LimitSnapshot } from './limits.ts'

export interface QueueItem {
  id: number
  project: string
  chatId: number
  threadId: number | null
  prompt: string
  resetsAt: number
}

export class LimitsStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000') // делим файл БД с SessionStore — ждём, а не падаем
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS limits (
        window TEXT PRIMARY KEY,
        utilization REAL NOT NULL,
        resets_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS limit_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        chat_id INTEGER NOT NULL,
        thread_id INTEGER,
        prompt TEXT NOT NULL,
        resets_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)
  }

  upsertLimit(s: LimitSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO limits (window, utilization, resets_at, status, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(window) DO UPDATE SET utilization = excluded.utilization, resets_at = excluded.resets_at,
           status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(s.window, s.utilization, s.resetsAt, s.status, Date.now())
  }

  listLimits(): LimitSnapshot[] {
    return this.db
      .prepare('SELECT window, utilization, resets_at AS resetsAt, status FROM limits ORDER BY window')
      .all() as LimitSnapshot[]
  }

  enqueue(item: Omit<QueueItem, 'id'>): number {
    const info = this.db
      .prepare('INSERT INTO limit_queue (project, chat_id, thread_id, prompt, resets_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(item.project, item.chatId, item.threadId, item.prompt, item.resetsAt, Date.now())
    return Number(info.lastInsertRowid)
  }

  listQueue(): QueueItem[] {
    return this.db
      .prepare('SELECT id, project, chat_id AS chatId, thread_id AS threadId, prompt, resets_at AS resetsAt FROM limit_queue ORDER BY id')
      .all() as QueueItem[]
  }

  removeQueue(id: number): void {
    this.db.prepare('DELETE FROM limit_queue WHERE id = ?').run(id)
  }
}
