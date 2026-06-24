import { describe, it, expect } from 'vitest'
import { renderStatus } from './status.ts'

describe('renderStatus', () => {
  it('says empty when no projects', () => {
    expect(renderStatus([])).toContain('Нет проектов')
  })

  it('formats a running, a session, and an idle project', () => {
    const text = renderStatus([
      { project: 'spike', mode: 'default', model: 'claude-opus-4-8', effort: 'high', hasSession: true, running: true },
      { project: 'game', mode: 'acceptEdits', model: 'claude-sonnet-4-6', effort: 'medium', hasSession: true, running: false },
      { project: 'mcp', mode: 'bypassPermissions', model: 'claude-haiku-4-5-20251001', effort: 'low', hasSession: false, running: false },
    ])
    expect(text).toContain('🟢') // running
    expect(text).toContain('🟡') // has session, idle
    expect(text).toContain('⚪') // no session
    expect(text).toContain('spike')
    expect(text).toContain('Opus 4.8') // человекочитаемая модель
  })
})
