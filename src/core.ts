import { Registry } from './registry.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { runPrompt, type RunParams, type ApprovalFn } from './runner.ts'
import { EFFORT_THINKING } from './settings.ts'
import type { RunnerEvent } from './events.ts'

// Тип функции-раннера для DI в тестах.
export type RunFn = (p: RunParams) => AsyncGenerator<RunnerEvent>

export class Core {
  private readonly running = new Set<string>()

  constructor(
    private readonly registry: Registry,
    private readonly settings: SettingsStore,
    private readonly sessions: SessionStore,
    private readonly run: RunFn = (p) => runPrompt(p),
  ) {}

  isRunning(project: string): boolean {
    return this.running.has(project)
  }

  async handle(
    projectName: string,
    prompt: string,
    onEvent: (e: RunnerEvent) => void | Promise<void>,
    onApproval?: ApprovalFn,
  ): Promise<void> {
    const project = this.registry.get(projectName) // бросит при неизвестном проекте
    const eff = this.settings.effective(projectName, project.defaultMode)
    const resume = this.sessions.getSessionId(projectName)

    this.running.add(projectName)
    try {
      for await (const ev of this.run({
        cwd: project.dir,
        prompt,
        permissionMode: eff.mode,
        model: eff.model,
        maxThinkingTokens: EFFORT_THINKING[eff.effort],
        resume,
        onApproval,
      })) {
        if (ev.kind === 'init') this.sessions.setSession(projectName, ev.sessionId)
        else if (ev.kind === 'result') this.sessions.setSession(projectName, ev.sessionId)
        await onEvent(ev)
      }
    } finally {
      this.running.delete(projectName)
    }
  }
}
