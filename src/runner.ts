import { query } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionMode } from './registry.ts'
import type { RunnerEvent } from './events.ts'
import { normalize } from './normalize.ts'

export interface RunParams {
  cwd: string
  prompt: string
  permissionMode: PermissionMode
  resume?: string
}

// Тип функции запуска — для подмены в тестах core (DI).
export type QueryFn = typeof query

export async function* runPrompt(p: RunParams, q: QueryFn = query): AsyncGenerator<RunnerEvent> {
  const iter = q({
    prompt: p.prompt,
    options: {
      cwd: p.cwd,
      permissionMode: p.permissionMode,
      allowDangerouslySkipPermissions: p.permissionMode === 'bypassPermissions',
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
      ...(p.resume ? { resume: p.resume } : {}),
    },
  })

  for await (const msg of iter) {
    for (const ev of normalize(msg)) yield ev
  }
}
