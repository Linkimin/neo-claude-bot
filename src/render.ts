import type { RunnerEvent } from './events.ts'

export { renderToolUse } from './toolRender.ts'

export function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '…'
}

export function resultFooter(ev: Extract<RunnerEvent, { kind: 'result' }>): string {
  const head = ev.ok ? '✅ готово' : '❌ ошибка'
  return `${head} · ${ev.numTurns} turns · $${ev.costUsd.toFixed(4)}`
}
