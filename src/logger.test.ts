import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { createLogger } from './logger.ts'

const TMP = 'tmp/logger-test.log'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

describe('createLogger', () => {
  it('writes info lines with level and timestamp to the file', () => {
    const log = createLogger(TMP)
    log.info('hello', 'world')
    const content = readFileSync(TMP, 'utf8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('hello world')
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T/) // ISO-таймстамп
  })

  it('writes error lines with ERROR level', () => {
    const log = createLogger(TMP)
    log.error('boom')
    expect(readFileSync(TMP, 'utf8')).toContain('[ERROR] boom')
  })
})
