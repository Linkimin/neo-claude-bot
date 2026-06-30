import { describe, it, expect } from 'vitest'
import { startWizard, selectRoot, enterSegment, goUp, selectCurrent, setLabel, setMode, PAGE_SIZE } from './projectWizard.ts'

describe('projectWizard transitions', () => {
  it('startWizard with one root skips pickRoot and goes to browse', () => {
    const s = startWizard(['D:/work'])
    expect(s.stage).toBe('browse')
    if (s.stage === 'browse') {
      expect(s.rootPath).toBe('D:/work')
      expect(s.currentPath).toBe('D:/work')
      expect(s.page).toBe(0)
    }
  })
  it('startWizard with many roots goes to pickRoot', () => {
    const s = startWizard(['D:/work', 'D:/play'])
    expect(s.stage).toBe('pickRoot')
  })
  it('selectRoot transitions pickRoot -> browse', () => {
    const s0 = startWizard(['D:/work', 'D:/play'])
    const s1 = selectRoot(s0, 1)
    expect(s1.stage).toBe('browse')
    if (s1.stage === 'browse') expect(s1.rootPath).toBe('D:/play')
  })
  it('enterSegment moves into a subdir (when resolver returns a path)', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = enterSegment(s0, 'sub', () => 'D:/work/sub')
    if (s1.stage !== 'browse') throw new Error('expected browse')
    expect(s1.currentPath).toBe('D:/work/sub')
    expect(s1.page).toBe(0)
  })
  it('enterSegment is rejected when resolver returns null (outside root)', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = enterSegment(s0, '..', () => null)
    expect(s1).toBe(s0) // state unchanged
  })
  it('goUp moves up, but only inside root', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = enterSegment(s0, 'sub', () => 'D:/work/sub')
    const s2 = goUp(s1, () => 'D:/work')
    if (s2.stage !== 'browse') throw new Error('expected browse')
    expect(s2.currentPath).toBe('D:/work')
    const s3 = goUp(s2, () => null) // rejected
    expect(s3).toBe(s2)
  })
  it('selectCurrent transitions browse -> awaitLabel with chosen dir', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = enterSegment(s0, 'sub', () => 'D:/work/sub')
    const s2 = selectCurrent(s1)
    expect(s2.stage).toBe('awaitLabel')
    if (s2.stage === 'awaitLabel') expect(s2.dir).toBe('D:/work/sub')
  })
  it('setLabel transitions awaitLabel -> pickMode with stored label', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = selectCurrent(enterSegment(s0, 'sub', () => 'D:/work/sub'))
    const s2 = setLabel(s1, 'My App')
    expect(s2.stage).toBe('pickMode')
    if (s2.stage === 'pickMode') {
      expect(s2.dir).toBe('D:/work/sub')
      expect(s2.label).toBe('My App')
    }
  })
  it('setMode transitions pickMode -> done', () => {
    const s0 = startWizard(['D:/work'])
    const s1 = setLabel(selectCurrent(enterSegment(s0, 'sub', () => 'D:/work/sub')), 'My App')
    const s2 = setMode(s1, 'acceptEdits')
    expect(s2.stage).toBe('done')
    if (s2.stage === 'done') {
      expect(s2.dir).toBe('D:/work/sub')
      expect(s2.label).toBe('My App')
      expect(s2.defaultMode).toBe('acceptEdits')
    }
  })
})

describe('PAGE_SIZE', () => {
  it('exported constant is 8', () => {
    expect(PAGE_SIZE).toBe(8)
  })
})
