import { describe, it, expect } from 'vitest'
import { resolveProject } from './route.ts'

// projectForThread: 100 -> 'spike', иначе null
const projectForThread = (id: number) => (id === 100 ? 'spike' : null)

describe('resolveProject', () => {
  it('private chat → default project', () => {
    expect(resolveProject({ chatType: 'private', threadId: undefined, defaultProject: 'spike', projectForThread })).toBe('spike')
  })

  it('private chat with null default → null', () => {
    expect(resolveProject({ chatType: 'private', threadId: undefined, defaultProject: null, projectForThread })).toBeNull()
  })

  it('supergroup topic with known thread → mapped project', () => {
    expect(resolveProject({ chatType: 'supergroup', threadId: 100, defaultProject: 'spike', projectForThread })).toBe('spike')
  })

  it('supergroup topic with unknown thread → null', () => {
    expect(resolveProject({ chatType: 'supergroup', threadId: 555, defaultProject: 'spike', projectForThread })).toBeNull()
  })

  it('supergroup General (no thread) → null', () => {
    expect(resolveProject({ chatType: 'supergroup', threadId: undefined, defaultProject: 'spike', projectForThread })).toBeNull()
  })
})
