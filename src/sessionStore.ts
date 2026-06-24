import Database from 'better-sqlite3'

export interface SessionRow {
  project: string
  sessionId: string
  updatedAt: number
}

// SQLite-хранилище «текущей сессии» проекта. Синхронный API better-sqlite3.
export class SessionStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        project TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
  }

  getSessionId(project: string): string | undefined {
    const row = this.db.prepare('SELECT session_id FROM sessions WHERE project = ?').get(project) as
      | { session_id: string }
      | undefined
    return row?.session_id
  }

  setSession(project: string, sessionId: string): void {
    this.db
      .prepare(
        `INSERT INTO sessions (project, session_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(project) DO UPDATE SET session_id = excluded.session_id, updated_at = excluded.updated_at`,
      )
      .run(project, sessionId, Date.now())
  }

  clear(project: string): void {
    this.db.prepare('DELETE FROM sessions WHERE project = ?').run(project)
  }

  list(): SessionRow[] {
    return this.db
      .prepare('SELECT project, session_id AS sessionId, updated_at AS updatedAt FROM sessions ORDER BY project')
      .all() as SessionRow[]
  }
}
