import { Registry } from './registry.ts'
import { SettingsStore } from './settingsStore.ts'
import { runPrompt, type RunParams } from './runner.ts'
import { EFFORT_THINKING } from './settings.ts'
import type { RunnerEvent } from './events.ts'

// Тип функции-раннера для DI в тестах.
export type RunFn = (p: RunParams) => AsyncGenerator<RunnerEvent>

export class Core {
  private readonly lastSession = new Map<string, string>()

  constructor(
    private readonly registry: Registry,
    private readonly settings: SettingsStore,
    private readonly run: RunFn = (p) => runPrompt(p),
  ) {}

  async handle(projectName: string, prompt: string, onEvent: (e: RunnerEvent) => void | Promise<void>): Promise<void> {
    const project = this.registry.get(projectName) // бросит при неизвестном проекте
    const eff = this.settings.effective(projectName, project.defaultMode)
    const resume = this.lastSession.get(projectName)

    for await (const ev of this.run({
      cwd: project.dir,
      prompt,
      permissionMode: eff.mode,
      model: eff.model,
      maxThinkingTokens: EFFORT_THINKING[eff.effort],
      resume,
    })) {
      if (ev.kind === 'init') this.lastSession.set(projectName, ev.sessionId)
      else if (ev.kind === 'result') this.lastSession.set(projectName, ev.sessionId)
      await onEvent(ev)
    }
  }
}
