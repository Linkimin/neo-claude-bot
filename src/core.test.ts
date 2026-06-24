import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync } from 'node:fs'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import type { RunnerEvent } from './events.ts'

const TMP = 'tmp/core-settings-test.json'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

const registry = new Registry([{ name: 'spike', dir: 'tmp/spike-project', defaultMode: 'bypassPermissions' }])

function fakeRun(events: RunnerEvent[], capture?: (p: any) => void) {
  return async function* (p: any): AsyncGenerator<RunnerEvent> {
    capture?.(p)
    for (const e of events) yield e
  }
}

describe('Core.handle', () => {
  it('passes effective settings (dir/mode/model/thinking) to runner', async () => {
    let seen: any
    const settings = SettingsStore.load(TMP)
    settings.set('spike', { model: 'claude-opus-4-8', effort: 'high' })
    const core = new Core(registry, settings, new SessionStore(':memory:'), fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    const got: RunnerEvent[] = []
    await core.handle('spike', 'do it', (e) => { got.push(e) })

    expect(seen.cwd).toBe('tmp/spike-project')
    expect(seen.permissionMode).toBe('bypassPermissions')
    expect(seen.model).toBe('claude-opus-4-8')
    expect(seen.maxThinkingTokens).toBe(32000) // high
    expect(got).toEqual([{ kind: 'assistant_text', text: 'hi' }])
  })

  it('persists sessionId from result and resumes next call', async () => {
    const captures: any[] = []
    const settings = SettingsStore.load(TMP)
    const sessions = new SessionStore(':memory:')
    const run = (events: RunnerEvent[]) =>
      async function* (p: any): AsyncGenerator<RunnerEvent> { captures.push(p); for (const e of events) yield e }

    const core = new Core(registry, settings, sessions, run([{ kind: 'result', ok: true, sessionId: 's-100', costUsd: 0, numTurns: 1 }]))
    await core.handle('spike', 'first', () => {})
    await core.handle('spike', 'second', () => {})

    expect(captures[0].resume).toBeUndefined()
    expect(captures[1].resume).toBe('s-100')
    expect(sessions.getSessionId('spike')).toBe('s-100')
  })

  it('throws on unknown project before running', async () => {
    const settings = SettingsStore.load(TMP)
    const core = new Core(registry, settings, new SessionStore(':memory:'), fakeRun([]))
    await expect(core.handle('nope', 'x', () => {})).rejects.toThrow(/unknown project/)
  })

  it('passes onApproval through to the runner', async () => {
    let seen: any
    const settings = SettingsStore.load(TMP)
    const core = new Core(registry, settings, new SessionStore(':memory:'), fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    const onApproval = async () => ({ allow: true as const })
    await core.handle('spike', 'do it', () => {}, onApproval)
    expect(seen.onApproval).toBe(onApproval)
  })

  it('reports isRunning false before and after a run', async () => {
    const settings = SettingsStore.load(TMP)
    const core = new Core(registry, settings, new SessionStore(':memory:'), fakeRun([{ kind: 'assistant_text', text: 'hi' }]))
    expect(core.isRunning('spike')).toBe(false)
    await core.handle('spike', 'do it', () => {})
    expect(core.isRunning('spike')).toBe(false)
  })
})
