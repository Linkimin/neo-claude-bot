import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync } from 'node:fs'
import { ensureTopics, type TopicApi } from './topicSetup.ts'
import { TopicMap } from './topics.ts'

const TMP = 'tmp/topicsetup-test.json'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

// Фейковое API: считает вызовы и выдаёт инкрементные thread_id.
function fakeApi() {
  const calls: { chatId: number; name: string }[] = []
  let next = 10
  const api: TopicApi = {
    async createForumTopic(chatId, name) { calls.push({ chatId, name }); return { message_thread_id: next++ } },
  }
  return { api, calls }
}

describe('ensureTopics', () => {
  it('creates a topic for each project missing a mapping', async () => {
    const { api, calls } = fakeApi()
    const topics = TopicMap.load(TMP)
    const created = await ensureTopics(api, -100, ['spike', 'game'], topics)

    expect(created).toEqual(['spike', 'game'])
    expect(calls).toEqual([{ chatId: -100, name: 'spike' }, { chatId: -100, name: 'game' }])
    expect(topics.get('spike')).toBe(10)
    expect(topics.get('game')).toBe(11)
  })

  it('skips projects that already have a mapping', async () => {
    const { api, calls } = fakeApi()
    const topics = TopicMap.load(TMP)
    topics.set('spike', 777)
    const created = await ensureTopics(api, -100, ['spike', 'game'], topics)

    expect(created).toEqual(['game'])
    expect(calls).toEqual([{ chatId: -100, name: 'game' }])
    expect(topics.get('spike')).toBe(777)
    expect(topics.get('game')).toBe(10)
  })
})
