import { spawn, type ChildProcess } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { log } from './logger.ts'

// Генерирует ~/.claude-code-router/config.json под routerai из конфига бота.
export function ensureCcrConfig(opts: { baseUrl: string; apiKey: string; port: number; models: string[]; defaultModel: string }): void {
  const dir = join(homedir(), '.claude-code-router')
  mkdirSync(dir, { recursive: true })
  const cfg = {
    PORT: opts.port,
    Providers: [
      { name: 'routerai', api_base_url: opts.baseUrl.replace(/\/$/, '') + '/chat/completions', api_key: opts.apiKey, models: opts.models },
    ],
    Router: { default: `routerai,${opts.defaultModel}` },
  }
  writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg, null, 2))
}

// Поднимает локальный CCR-прокси как дочерний процесс и перезапускает при выходе.
// Если на порту уже слушает CCR (напр. остался от прошлого запуска) — не спавнит и не лупит.
export class CcrProcess {
  private child: ChildProcess | null = null
  private stopped = false

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly env: Record<string, string>,
    private readonly healthUrl: string,
  ) {}

  async start(): Promise<void> {
    this.stopped = false
    await this.ensureUp()
  }

  private async ensureUp(): Promise<void> {
    if (this.stopped) return
    if (await this.healthy()) {
      log.info('CCR: уже доступен на', this.healthUrl, '— не спавню')
      return
    }
    this.spawnOnce()
  }

  private async healthy(): Promise<boolean> {
    try {
      await fetch(this.healthUrl, { signal: AbortSignal.timeout(2000) })
      return true
    } catch {
      return false
    }
  }

  private spawnOnce(): void {
    if (this.stopped) return
    log.info('CCR: запуск', this.command, this.args.join(' '))
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    this.child.on('exit', (code) => {
      log.info('CCR: процесс вышел, код', code ?? 'null')
      this.child = null
      // Перед респавном проверяем health: если порт уже кто-то держит — не лупим.
      if (!this.stopped) setTimeout(() => { void this.ensureUp() }, 3000)
    })
    this.child.on('error', (e) => log.error('CCR: ошибка процесса', e instanceof Error ? e.message : String(e)))
  }

  isAlive(): boolean {
    return this.child !== null
  }

  stop(): void {
    this.stopped = true
    this.child?.kill()
    this.child = null
  }
}
