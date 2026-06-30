import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync } from 'node:fs'
import { Core } from './core.ts'
import { Registry } from './registry.ts'
import { ProjectStore } from './projectStore.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import type { RunnerEvent } from './events.ts'

const TMP = 'tmp/core-settings-test.json'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

const projectStore = new ProjectStore(':memory:')
projectStore.add({ slug: 'spike', label: 'spike', dir: 'tmp/spike-project', defaultMode: 'bypassPermissions', threadId: null })
const registry = new Registry(projectStore)
const fb = { ccrUrl: 'http://localhost:3456', authToken: 'k' }

function fakeRun(events: RunnerEvent[], capture?: (p: any) => void) {
  return async function* (p: any): AsyncGenerator<RunnerEvent> {
    capture?.(p)
    for (const e of events) yield e
  }
}

describe('Core.handle', () => {
  it('claude provider (default): claude model, no env', async () => {
    let seen: any
    const settings = new SettingsStore(':memory:')
    settings.set('spike', { model: 'claude-opus-4-8', effort: 'high' })
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    await core.handle('spike', 'do it', () => {})
    expect(seen.model).toBe('claude-opus-4-8')
    expect(seen.maxThinkingTokens).toBe(32000)
    expect(seen.env).toBeUndefined()
  })

  it('fallback provider: routerai model + env + no thinking budget', async () => {
    let seen: any
    const settings = new SettingsStore(':memory:')
    settings.set('spike', { fallbackModel: 'deepseek/deepseek-v4-pro' })
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    core.setProvider('spike', 'fallback')
    await core.handle('spike', 'do it', () => {})
    expect(seen.model).toBe('deepseek/deepseek-v4-pro')
    expect(seen.env).toEqual({ ANTHROPIC_BASE_URL: 'http://localhost:3456', ANTHROPIC_AUTH_TOKEN: 'k', ANTHROPIC_API_KEY: '' })
    expect(seen.maxThinkingTokens).toBeUndefined()
  })

  it('getProvider defaults to claude', () => {
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([]))
    expect(core.getProvider('spike')).toBe('claude')
  })

  it('persists sessionId and resumes', async () => {
    const captures: any[] = []
    const settings = new SettingsStore(':memory:')
    const sessions = new SessionStore(':memory:')
    const run = (events: RunnerEvent[]) =>
      async function* (p: any): AsyncGenerator<RunnerEvent> { captures.push(p); for (const e of events) yield e }
    const core = new Core(registry, settings, sessions, fb, run([{ kind: 'result', ok: true, interrupted: false, sessionId: 's-100', costUsd: 0, numTurns: 1 }]))
    await core.handle('spike', 'first', () => {})
    await core.handle('spike', 'second', () => {})
    expect(captures[1].resume).toBe('s-100')
  })

  it('throws on unknown project', async () => {
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([]))
    await expect(core.handle('nope', 'x', () => {})).rejects.toThrow(/unknown project/)
  })

  it('passes onApproval through', async () => {
    let seen: any
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    const onApproval = async () => ({ allow: true as const })
    await core.handle('spike', 'do it', () => {}, onApproval)
    expect(seen.onApproval).toBe(onApproval)
  })

  it('isRunning false before/after', async () => {
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([{ kind: 'assistant_text', text: 'hi' }]))
    expect(core.isRunning('spike')).toBe(false)
    await core.handle('spike', 'do it', () => {})
    expect(core.isRunning('spike')).toBe(false)
  })

  it('passes an AbortController to the runner', async () => {
    let seen: any
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([{ kind: 'assistant_text', text: 'hi' }], (p) => (seen = p)))
    await core.handle('spike', 'do it', () => {})
    expect(seen.abortController).toBeInstanceOf(AbortController)
  })

  it('interrupt returns false when nothing is running', () => {
    const settings = new SettingsStore(':memory:')
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, fakeRun([]))
    expect(core.interrupt('spike')).toBe(false)
  })

  it('interrupt() calls the run handle and stops the in-flight run', async () => {
    const settings = new SettingsStore(':memory:')
    // Раннер ждёт, пока вызовут handle.interrupt(), затем отдаёт result:interrupt.
    const run = (p: any) => (async function* (): AsyncGenerator<RunnerEvent> {
      let stop!: () => void
      const stopped = new Promise<void>((resolve) => { stop = resolve })
      p.onQuery?.({ interrupt: async () => { stop() } })
      await stopped
      yield { kind: 'result', ok: false, interrupted: true, sessionId: 's', costUsd: 0, numTurns: 0 }
    })()
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, run)
    let done = false
    const p = core.handle('spike', 'long', () => {}).then(() => { done = true })
    await new Promise((r) => setTimeout(r, 10))
    expect(core.interrupt('spike')).toBe(true)
    await p
    expect(done).toBe(true)
  })

  it('swallows post-interrupt transport error and synthesizes result:interrupted', async () => {
    const settings = new SettingsStore(':memory:')
    // Раннер бросает (как kill закрывает транспорт) после вызова interrupt — без result.
    const run = (p: any) => (async function* (): AsyncGenerator<RunnerEvent> {
      let stop!: () => void
      const stopped = new Promise<void>((resolve) => { stop = resolve })
      p.onQuery?.({ interrupt: async () => { stop() } })
      await stopped
      throw new Error('Claude Code process exited unexpectedly')
    })()
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, run)
    const events: RunnerEvent[] = []
    const p = core.handle('spike', 'long', (e) => { events.push(e) })
    await new Promise((r) => setTimeout(r, 10))
    expect(core.interrupt('spike')).toBe(true)
    await expect(p).resolves.toBeUndefined() // не пробрасывает ошибку
    const result = events.find((e) => e.kind === 'result')
    expect(result).toMatchObject({ kind: 'result', interrupted: true })
  })

  it('synthesizes result:interrupted when the run ends without a result after interrupt', async () => {
    const settings = new SettingsStore(':memory:')
    // Раннер завершает поток БЕЗ result (как SDK после kill) — без throw.
    const run = (p: any) => (async function* (): AsyncGenerator<RunnerEvent> {
      let stop!: () => void
      const stopped = new Promise<void>((resolve) => { stop = resolve })
      p.onQuery?.({ interrupt: async () => { stop() } })
      await stopped
      // просто возвращаемся — никаких событий
    })()
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, run)
    const events: RunnerEvent[] = []
    const p = core.handle('spike', 'long', (e) => { events.push(e) })
    await new Promise((r) => setTimeout(r, 10))
    expect(core.interrupt('spike')).toBe(true)
    await p
    expect(events.find((e) => e.kind === 'result')).toMatchObject({ kind: 'result', interrupted: true })
  })

  it('rethrows a genuine run error when no interrupt was requested', async () => {
    const settings = new SettingsStore(':memory:')
    const run = () => (async function* (): AsyncGenerator<RunnerEvent> {
      throw new Error('boom')
    })()
    const core = new Core(registry, settings, new SessionStore(':memory:'), fb, run)
    await expect(core.handle('spike', 'x', () => {})).rejects.toThrow('boom')
  })
})
