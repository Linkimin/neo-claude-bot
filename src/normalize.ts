import type { RunnerEvent } from './events.ts'

// Превращает одно SDK-сообщение в ноль или больше RunnerEvent.
// Формы взяты из M0-findings. `msg` намеренно `any` — это адаптер к внешнему SDK.
export function normalize(msg: any): RunnerEvent[] {
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        return [{ kind: 'init', sessionId: msg.session_id, model: msg.model, mode: msg.permissionMode }]
      }
      if (msg.subtype === 'post_turn_summary') {
        return [{ kind: 'status', category: msg.status_category, detail: msg.status_detail }]
      }
      return [] // thinking_tokens, compact_boundary и прочий шум

    case 'assistant': {
      const events: RunnerEvent[] = []
      for (const block of msg.message?.content ?? []) {
        if (block.type === 'text') events.push({ kind: 'assistant_text', text: block.text })
        else if (block.type === 'tool_use') events.push({ kind: 'tool_use', name: block.name, input: block.input })
        // thinking — игнорируем
      }
      return events
    }

    case 'rate_limit_event': {
      const i = msg.rate_limit_info ?? {}
      return [{ kind: 'rate_limit', rateLimitType: i.rateLimitType, utilization: i.utilization, resetsAt: i.resetsAt, status: i.status }]
    }

    case 'result':
      return [{
        kind: 'result',
        ok: msg.is_error === false && msg.subtype === 'success',
        sessionId: msg.session_id,
        costUsd: msg.total_cost_usd ?? 0,
        numTurns: msg.num_turns ?? 0,
      }]

    default:
      return [] // user/tool_result, stream_event и пр.
  }
}
