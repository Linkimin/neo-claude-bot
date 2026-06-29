import { spawn, type ChildProcess } from 'node:child_process'
import { log } from './logger.ts'

// Поднимает локальный CCR-прокси как дочерний процесс и перезапускает при выходе.
export class CcrProcess {
  private child: ChildProcess | null = null
  private stopped = false

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly cwd: string,
    private readonly env: Record<string, string>,
  ) {}

  start(): void {
    this.stopped = false
    this.spawnOnce()
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
      if (!this.stopped) setTimeout(() => this.spawnOnce(), 3000)
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
