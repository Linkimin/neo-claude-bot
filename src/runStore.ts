import Database from 'better-sqlite3'

export interface RunRow {
  id: number
  project: string
  chatId: number
  threadId: number | null
  prompt: string
}

// Таблица «идущих сейчас» прогонов. Норм. завершение удаляет строку →
// оставшиеся строки = прерванные крашем.
export class RunStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        chat_id INTEGER NOT NULL,
        thread_id INTEGER,
        prompt TEXT NOT NULL,
        started_at INTEGER NOT NULL
      )
    `)
  }

  start(project: string, chatId: number, threadId: number | null, prompt: string): number {
    const info = this.db
      .prepare('INSERT INTO runs (project, chat_id, thread_id, prompt, started_at) VALUES (?, ?, ?, ?, ?)')
      .run(project, chatId, threadId, prompt, Date.now())
    return Number(info.lastInsertRowid)
  }

  get(id: number): RunRow | undefined {
    return this.db
      .prepare('SELECT id, project, chat_id AS chatId, thread_id AS threadId, prompt FROM runs WHERE id = ?')
      .get(id) as RunRow | undefined
  }

  listInterrupted(): RunRow[] {
    return this.db
      .prepare('SELECT id, project, chat_id AS chatId, thread_id AS threadId, prompt FROM runs ORDER BY id')
      .all() as RunRow[]
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM runs WHERE id = ?').run(id)
  }

  close(): void {
    this.db.close()
  }
}
