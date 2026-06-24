import { Registry } from './registry.ts'
import { runPrompt, type RunParams } from './runner.ts'
import type { RunnerEvent } from './events.ts'

// Тип функции-раннера для DI в тестах.
export type RunFn = (p: RunParams) => AsyncGenerator<RunnerEvent>

export class Core {
  private readonly lastSession = new Map<string, string>()

  constructor(
    private readonly registry: Registry,
    private readonly run: RunFn = (p) => runPrompt(p),
  ) {}

  async handle(projectName: string, prompt: string, onEvent: (e: RunnerEvent) => void): Promise<void> {
    const project = this.registry.get(projectName) // бросит при неизвестном проекте
    const resume = this.lastSession.get(projectName)

    for await (const ev of this.run({ cwd: project.dir, prompt, permissionMode: project.defaultMode, resume })) {
      if (ev.kind === 'init') this.lastSession.set(projectName, ev.sessionId)
      else if (ev.kind === 'result') this.lastSession.set(projectName, ev.sessionId)
      onEvent(ev)
    }
  }
}
