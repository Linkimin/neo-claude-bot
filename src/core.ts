import { Registry } from './registry.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { runPrompt, type RunParams, type ApprovalFn } from './runner.ts'
import { EFFORT_THINKING } from './settings.ts'
import { providerOverride, type Provider } from './providers.ts'
import type { RunnerEvent } from './events.ts'

// Тип функции-раннера для DI в тестах.
export type RunFn = (p: RunParams) => AsyncGenerator<RunnerEvent>

// Управление живым прогоном: graceful-стоп текущего хода + жёсткий abort транспорта.
interface RunControl {
  interrupt: () => Promise<void>
  abort: () => void
}

export class Core {
  private readonly running = new Set<string>()
  private readonly providers = new Map<string, Provider>()
  private readonly controls = new Map<string, RunControl>()
  private readonly aborting = new Set<string>()

  constructor(
    private readonly registry: Registry,
    private readonly settings: SettingsStore,
    private readonly sessions: SessionStore,
    private readonly fallback: { ccrUrl: string; authToken: string } | null,
    private readonly run: RunFn = (p) => runPrompt(p),
  ) {}

  isRunning(project: string): boolean {
    return this.running.has(project)
  }

  getProvider(project: string): Provider {
    return this.providers.get(project) ?? 'claude'
  }

  setProvider(project: string, provider: Provider): void {
    this.providers.set(project, provider)
  }

  interrupt(project: string): boolean {
    const c = this.controls.get(project)
    if (!c) return false
    // Помечаем намерение, чтобы handle проглотил ошибку транспорта от kill.
    this.aborting.add(project)
    // interrupt() гасит текущий ход; abort() гарантированно закрывает поток
    // (в streaming-input сессия иначе зависает в ожидании следующего ввода).
    void c.interrupt().catch(() => {})
    c.abort()
    this.controls.delete(project)
    return true
  }

  async handle(
    projectName: string,
    prompt: string,
    onEvent: (e: RunnerEvent) => void | Promise<void>,
    onApproval?: ApprovalFn,
  ): Promise<void> {
    const project = this.registry.get(projectName) // бросит при неизвестном проекте
    const eff = this.settings.effective(projectName, project.defaultMode)
    const provider = this.getProvider(projectName)
    const override = providerOverride(provider, eff.fallbackModel, this.fallback)
    const resume = this.sessions.getSessionId(projectName)

    const controller = new AbortController()
    this.running.add(projectName)
    let sawResult = false
    try {
      try {
        for await (const ev of this.run({
          cwd: project.dir,
          prompt,
          permissionMode: eff.mode,
          model: override.model ?? eff.model,
          maxThinkingTokens: provider === 'fallback' ? undefined : EFFORT_THINKING[eff.effort],
          env: override.env,
          abortController: controller,
          resume,
          onApproval,
          onQuery: (h) => this.controls.set(projectName, { interrupt: h.interrupt, abort: () => controller.abort() }),
        })) {
          if (ev.kind === 'init') this.sessions.setSession(projectName, ev.sessionId)
          else if (ev.kind === 'result') { sawResult = true; this.sessions.setSession(projectName, ev.sessionId) }
          await onEvent(ev)
        }
      } catch (err) {
        // Прерывание форс-закрывает транспорт (abort → kill) — иногда это прилетает
        // ошибкой. Если прерывали — глушим; иначе это настоящий сбой, пробрасываем.
        if (!this.aborting.has(projectName)) throw err
      }
      // После прерывания SDK часто завершает поток вообще без result-события
      // (генератор просто возвращается после kill). Синтезируем result:interrupted,
      // чтобы бот показал «Остановлено», а не молча оборвал статус.
      if (this.aborting.has(projectName) && !sawResult) {
        await onEvent({ kind: 'result', ok: false, interrupted: true, sessionId: resume ?? '', costUsd: 0, numTurns: 0 })
      }
    } finally {
      this.running.delete(projectName)
      this.controls.delete(projectName)
      this.aborting.delete(projectName)
    }
  }
}
