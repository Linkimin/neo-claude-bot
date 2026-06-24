import { describe, it, expect } from 'vitest'
import { normalize } from './normalize.ts'

describe('normalize', () => {
  it('maps system:init', () => {
    const out = normalize({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-sonnet-4-6', permissionMode: 'bypassPermissions' })
    expect(out).toEqual([{ kind: 'init', sessionId: 's1', model: 'claude-sonnet-4-6', mode: 'bypassPermissions' }])
  })

  it('maps assistant text and tool_use blocks (multiple per message)', () => {
    const out = normalize({
      type: 'assistant', session_id: 's1',
      message: { content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', name: 'Edit', input: { file_path: 'a.txt' } },
      ] },
    })
    expect(out).toEqual([
      { kind: 'assistant_text', text: 'hello' },
      { kind: 'tool_use', name: 'Edit', input: { file_path: 'a.txt' } },
    ])
  })

  it('ignores assistant thinking blocks', () => {
    const out = normalize({ type: 'assistant', session_id: 's1', message: { content: [{ type: 'thinking' }] } })
    expect(out).toEqual([])
  })

  it('ignores system:thinking_tokens and user messages', () => {
    expect(normalize({ type: 'system', subtype: 'thinking_tokens', session_id: 's1' })).toEqual([])
    expect(normalize({ type: 'user', session_id: 's1', message: { content: [{ type: 'tool_result', content: 'x' }] } })).toEqual([])
  })

  it('maps system:post_turn_summary to status', () => {
    const out = normalize({ type: 'system', subtype: 'post_turn_summary', session_id: 's1', status_category: 'review_ready', status_detail: 'done' })
    expect(out).toEqual([{ kind: 'status', category: 'review_ready', detail: 'done' }])
  })

  it('maps rate_limit_event', () => {
    const out = normalize({ type: 'rate_limit_event', session_id: 's1', rate_limit_info: { status: 'allowed_warning', resetsAt: 1782680400, rateLimitType: 'seven_day', utilization: 0.56 } })
    expect(out).toEqual([{ kind: 'rate_limit', rateLimitType: 'seven_day', utilization: 0.56, resetsAt: 1782680400, status: 'allowed_warning' }])
  })

  it('maps result:success to ok result', () => {
    const out = normalize({ type: 'result', subtype: 'success', is_error: false, session_id: 's1', total_cost_usd: 0.07, num_turns: 6 })
    expect(out).toEqual([{ kind: 'result', ok: true, sessionId: 's1', costUsd: 0.07, numTurns: 6 }])
  })

  it('maps error result to not-ok', () => {
    const out = normalize({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's1', total_cost_usd: 0.01, num_turns: 2 })
    expect(out).toEqual([{ kind: 'result', ok: false, sessionId: 's1', costUsd: 0.01, numTurns: 2 }])
  })
})
