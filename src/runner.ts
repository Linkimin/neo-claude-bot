import { query } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionMode } from './registry.ts'
import type { RunnerEvent } from './events.ts'
import type { ApprovalDecision } from './approvals.ts'
import { normalize } from './normalize.ts'

// Колбэк бота: спросить у пользователя разрешение на инструмент.
export type ApprovalFn = (toolName: string, input: unknown) => Promise<ApprovalDecision>

export interface RunParams {
  cwd: string
  prompt: string
  permissionMode: PermissionMode
  model?: string
  maxThinkingTokens?: number
  env?: Record<string, string>
  abortController?: AbortController
  resume?: string
  onApproval?: ApprovalFn
}

// Тип функции запуска — для подмены в тестах core (DI).
export type QueryFn = typeof query

export async function* runPrompt(p: RunParams, q: QueryFn = query): AsyncGenerator<RunnerEvent> {
  // canUseTool подключаем только когда есть обработчик и режим не bypass
  // (в bypass SDK его не вызывает; не задаём, чтобы не смешивать с allowDangerouslySkipPermissions).
  const onApproval = p.onApproval
  const canUseTool =
    onApproval && p.permissionMode !== 'bypassPermissions'
      ? async (_toolName: string, input: any) => {
          const d = await onApproval(_toolName, input)
          return d.allow
            ? { behavior: 'allow' as const, updatedInput: input }
            : { behavior: 'deny' as const, message: d.message }
        }
      : undefined

  const iter = q({
    prompt: p.prompt,
    options: {
      cwd: p.cwd,
      permissionMode: p.permissionMode,
      allowDangerouslySkipPermissions: p.permissionMode === 'bypassPermissions',
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
      ...(p.model ? { model: p.model } : {}),
      ...(p.maxThinkingTokens ? { maxThinkingTokens: p.maxThinkingTokens } : {}),
      ...(p.env ? { env: p.env } : {}),
      ...(p.abortController ? { abortController: p.abortController } : {}),
      ...(p.resume ? { resume: p.resume } : {}),
      ...(canUseTool ? { canUseTool } : {}),
    },
  })

  for await (const msg of iter) {
    for (const ev of normalize(msg)) yield ev
  }
}
