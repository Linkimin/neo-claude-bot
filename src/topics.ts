import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Персист соответствия имя_проекта -> message_thread_id в JSON-файле.
// Для M2 этого достаточно; переезд в SQLite — позже.
export class TopicMap {
  private constructor(
    private readonly path: string,
    private readonly map: Record<string, number>,
  ) {}

  static load(path: string): TopicMap {
    const data = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>)
      : {}
    return new TopicMap(path, data)
  }

  get(project: string): number | undefined {
    return this.map[project]
  }

  projectForThread(threadId: number): string | null {
    for (const [name, id] of Object.entries(this.map)) {
      if (id === threadId) return name
    }
    return null
  }

  set(project: string, threadId: number): void {
    this.map[project] = threadId
    this.save()
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.map, null, 2))
  }
}
