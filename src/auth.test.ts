import { describe, it, expect } from 'vitest'
import { isAllowed } from './auth.ts'

describe('isAllowed', () => {
  it('allows the configured user', () => {
    expect(isAllowed(12345, 12345)).toBe(true)
  })
  it('rejects any other user', () => {
    expect(isAllowed(999, 12345)).toBe(false)
  })
  it('rejects undefined user id', () => {
    expect(isAllowed(undefined, 12345)).toBe(false)
  })
})
