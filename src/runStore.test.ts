import { describe, it, expect } from 'vitest'
import { RunStore } from './runStore.ts'

describe('RunStore', () => {
  it('start returns id; get fetches the row', () => {
    const s = new RunStore(':memory:')
    const id = s.start('spike', -100, 7, 'do it')
    expect(typeof id).toBe('number')
    expect(s.get(id)).toMatchObject({ id, project: 'spike', chatId: -100, threadId: 7, prompt: 'do it' })
  })

  it('listInterrupted returns all live rows (rows present = interrupted)', () => {
    const s = new RunStore(':memory:')
    s.start('spike', 1, null, 'a')
    s.start('game', 2, 9, 'b')
    expect(s.listInterrupted().map((r) => r.project)).toEqual(['spike', 'game'])
  })

  it('remove deletes a row (normal completion or recovery action)', () => {
    const s = new RunStore(':memory:')
    const id = s.start('spike', 1, null, 'a')
    s.remove(id)
    expect(s.get(id)).toBeUndefined()
    expect(s.listInterrupted()).toHaveLength(0)
  })

  it('stores null threadId for non-topic chats', () => {
    const s = new RunStore(':memory:')
    const id = s.start('spike', 1, null, 'a')
    expect(s.get(id)!.threadId).toBeNull()
  })
})
