import Database from 'better-sqlite3'

export interface SpendRow {
  project: string
  provider: string
  totalUsd: number
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export class SpendStore {
  private readonly db: Database.Database

  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spend (
        project TEXT NOT NULL,
        day TEXT NOT NULL,
        provider TEXT NOT NULL,
        total_usd REAL NOT NULL,
        PRIMARY KEY (project, day, provider)
      )
    `)
  }

  add(project: string, provider: string, usd: number, day: string = todayStr()): void {
    this.db
      .prepare(
        `INSERT INTO spend (project, day, provider, total_usd) VALUES (?, ?, ?, ?)
         ON CONFLICT(project, day, provider) DO UPDATE SET total_usd = total_usd + excluded.total_usd`,
      )
      .run(project, day, provider, usd)
  }

  today(day: string = todayStr()): SpendRow[] {
    return this.db
      .prepare('SELECT project, provider, total_usd AS totalUsd FROM spend WHERE day = ? ORDER BY project, provider')
      .all(day) as SpendRow[]
  }

  todayTotal(day: string = todayStr()): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(total_usd), 0) AS t FROM spend WHERE day = ?').get(day) as { t: number }
    return row.t
  }

  close(): void {
    this.db.close()
  }
}
