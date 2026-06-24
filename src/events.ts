// Нормализованные события для core/bot. SDK-специфика остаётся в normalize.ts.
export type RunnerEvent =
  | { kind: 'init'; sessionId: string; model: string; mode: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_use'; name: string; input: unknown }
  | { kind: 'status'; category: string; detail: string }
  | { kind: 'rate_limit'; rateLimitType: string; utilization: number; resetsAt: number; status: string }
  | { kind: 'result'; ok: boolean; sessionId: string; costUsd: number; numTurns: number }
