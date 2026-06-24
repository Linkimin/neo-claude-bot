import { describe, it, expect } from 'vitest'
import { renderApprovalRequest, parseApprovalCallback, ApprovalRegistry } from './approvals.ts'

describe('renderApprovalRequest', () => {
  it('shows tool name and compact input', () => {
    const text = renderApprovalRequest('Bash', { command: 'echo hi' })
    expect(text).toContain('Bash')
    expect(text).toContain('echo hi')
  })
})

describe('parseApprovalCallback', () => {
  it('parses approve/deny with id', () => {
    expect(parseApprovalCallback('appr:approve:a1')).toEqual({ decision: 'approve', id: 'a1' })
    expect(parseApprovalCallback('appr:deny:a7')).toEqual({ decision: 'deny', id: 'a7' })
  })
  it('returns null for junk', () => {
    expect(parseApprovalCallback('set:model:x')).toBeNull()
    expect(parseApprovalCallback('appr:maybe:a1')).toBeNull()
  })
})

describe('ApprovalRegistry', () => {
  it('register returns unique ids and a pending promise', () => {
    const r = new ApprovalRegistry()
    const a = r.register()
    const b = r.register()
    expect(a.id).not.toBe(b.id)
  })

  it('resolve(approve) settles the promise as allow', async () => {
    const r = new ApprovalRegistry()
    const { id, promise } = r.register()
    expect(r.resolve(id, 'approve')).toBe(true)
    expect(await promise).toEqual({ allow: true })
  })

  it('resolve(deny) settles the promise as deny with a message', async () => {
    const r = new ApprovalRegistry()
    const { id, promise } = r.register()
    expect(r.resolve(id, 'deny')).toBe(true)
    expect(await promise).toEqual({ allow: false, message: 'Отклонено пользователем' })
  })

  it('resolve is one-shot and unknown ids return false', () => {
    const r = new ApprovalRegistry()
    const { id } = r.register()
    expect(r.resolve(id, 'approve')).toBe(true)
    expect(r.resolve(id, 'approve')).toBe(false) // уже разрешён
    expect(r.resolve('nope', 'deny')).toBe(false)
  })
})
