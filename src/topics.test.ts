import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync, readFileSync } from 'node:fs'
import { TopicMap } from './topics.ts'

const TMP = 'tmp/topics-test.json'
afterEach(() => { if (existsSync(TMP)) rmSync(TMP) })

describe('TopicMap', () => {
  it('starts empty when file is absent', () => {
    const t = TopicMap.load(TMP)
    expect(t.get('spike')).toBeUndefined()
    expect(t.projectForThread(42)).toBeNull()
  })

  it('set persists to disk and is reloadable', () => {
    const t = TopicMap.load(TMP)
    t.set('spike', 100)
    t.set('game', 200)
    expect(existsSync(TMP)).toBe(true)

    const reloaded = TopicMap.load(TMP)
    expect(reloaded.get('spike')).toBe(100)
    expect(reloaded.get('game')).toBe(200)
  })

  it('reverse-looks-up project by thread id', () => {
    const t = TopicMap.load(TMP)
    t.set('spike', 100)
    expect(t.projectForThread(100)).toBe('spike')
    expect(t.projectForThread(999)).toBeNull()
  })

  it('writes valid JSON', () => {
    const t = TopicMap.load(TMP)
    t.set('spike', 100)
    expect(JSON.parse(readFileSync(TMP, 'utf8'))).toEqual({ spike: 100 })
  })
})
