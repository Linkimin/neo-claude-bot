import { describe, it, expect } from 'vitest'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import type { RunnerEvent } from './events.ts'

const registry = new Registry([{ name: 'spike', dir: 'tmp/spike-project', defaultMode: 'bypassPermissions' }])

// Фейковый runner: проверяет переданные параметры и отдаёт заранее заданные события.
function fakeRun(events: RunnerEvent[], capture?: (p: any) => void) {
  return async function* (p: any): AsyncGenerator<RunnerEvent> {
    capture?.(p)
    for (const e of events) yield e
  }
}

describe('Core.handle', () => {
  it('resolves project dir and forwards events', async () => {
    let seen: any
    const core = new Core(registry, fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    const got: RunnerEvent[] = []
    await core.handle('spike', 'do it', (e) => { got.push(e) })

    expect(seen.cwd).toBe('tmp/spike-project')
    expect(seen.prompt).toBe('do it')
    expect(seen.permissionMode).toBe('bypassPermissions')
    expect(got).toEqual([{ kind: 'assistant_text', text: 'hi' }])
  })

  it('remembers sessionId from result and resumes next call', async () => {
    const captures: any[] = []
    const run = (events: RunnerEvent[]) =>
      async function* (p: any): AsyncGenerator<RunnerEvent> { captures.push(p); for (const e of events) yield e }

    // первый вызов: runner отдаёт result с sessionId s-100
    const core = new Core(registry, run([{ kind: 'result', ok: true, sessionId: 's-100', costUsd: 0, numTurns: 1 }]))
    await core.handle('spike', 'first', () => {})
    // второй вызов: core должен передать resume: 's-100'
    await core.handle('spike', 'second', () => {})

    expect(captures[0].resume).toBeUndefined()
    expect(captures[1].resume).toBe('s-100')
  })

  it('throws on unknown project before running', async () => {
    const core = new Core(registry, fakeRun([]))
    await expect(core.handle('nope', 'x', () => {})).rejects.toThrow(/unknown project/)
  })
})
