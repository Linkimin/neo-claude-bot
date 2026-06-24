import { describe, it, expect } from 'vitest'
import { parseRecoveryCallback } from './recovery.ts'

describe('parseRecoveryCallback', () => {
  it('parses continue/restart/cancel with numeric id', () => {
    expect(parseRecoveryCallback('recover:continue:12')).toEqual({ action: 'continue', id: 12 })
    expect(parseRecoveryCallback('recover:restart:3')).toEqual({ action: 'restart', id: 3 })
    expect(parseRecoveryCallback('recover:cancel:7')).toEqual({ action: 'cancel', id: 7 })
  })
  it('returns null for junk or non-numeric id', () => {
    expect(parseRecoveryCallback('appr:approve:a1')).toBeNull()
    expect(parseRecoveryCallback('recover:continue:x')).toBeNull()
    expect(parseRecoveryCallback('recover:boom:1')).toBeNull()
  })
})
