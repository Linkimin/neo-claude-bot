import { describe, it, expect } from 'vitest'
import { LimitsStore } from './limitsStore.ts'

describe('LimitsStore limits table', () => {
  it('upserts and lists snapshots by window', () => {
    const s = new LimitsStore(':memory:')
    s.upsertLimit({ window: 'five_hour', utilization: 0.3, resetsAt: 100, status: 'allowed' })
    s.upsertLimit({ window: 'seven_day', utilization: 0.6, resetsAt: 200, status: 'allowed_warning' })
    s.upsertLimit({ window: 'five_hour', utilization: 0.4, resetsAt: 150, status: 'allowed' }) // overwrite
    const list = s.listLimits()
    expect(list.map((x) => x.window)).toEqual(['five_hour', 'seven_day'])
    expect(list.find((x) => x.window === 'five_hour')!.utilization).toBe(0.4)
  })
})

describe('LimitsStore queue', () => {
  it('enqueue returns id; listQueue returns the item; remove deletes it', () => {
    const s = new LimitsStore(':memory:')
    const id = s.enqueue({ project: 'spike', chatId: -100, threadId: 7, prompt: 'go', resetsAt: 999 })
    expect(typeof id).toBe('number')
    const all = s.listQueue()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id, project: 'spike', chatId: -100, threadId: 7, prompt: 'go', resetsAt: 999 })
    s.removeQueue(id)
    expect(s.listQueue()).toHaveLength(0)
  })

  it('stores null threadId for non-topic chats', () => {
    const s = new LimitsStore(':memory:')
    s.enqueue({ project: 'spike', chatId: 5, threadId: null, prompt: 'x', resetsAt: 1 })
    expect(s.listQueue()[0].threadId).toBeNull()
  })
})
