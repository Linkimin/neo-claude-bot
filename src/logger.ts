import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface Logger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

function line(level: string, args: unknown[]): string {
  const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  return `[${new Date().toISOString()}] [${level}] ${msg}\n`
}

export function createLogger(path: string): Logger {
  mkdirSync(dirname(path), { recursive: true })
  const write = (level: string, args: unknown[]) => {
    const text = line(level, args)
    try { appendFileSync(path, text) } catch { /* лог не должен валить процесс */ }
    if (level === 'ERROR') process.stderr.write(text)
    else process.stdout.write(text)
  }
  return {
    info: (...args) => write('INFO', args),
    error: (...args) => write('ERROR', args),
  }
}

// Дефолтный инстанс приложения — пишет в data/bot.log.
export const log = createLogger(resolve('data/bot.log'))
