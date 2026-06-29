import { describe, it, expect } from 'vitest'
import { providerOverride, shouldAutoFailover } from './providers.ts'

const fb = { ccrUrl: 'http://localhost:3456', authToken: 'k' }

describe('shouldAutoFailover', () => {
  it('true only when autoFailover on + fallback configured + currently on claude', () => {
    expect(shouldAutoFailover(true, true, 'claude')).toBe(true)
  })
  it('false when autoFailover off', () => {
    expect(shouldAutoFailover(false, true, 'claude')).toBe(false)
  })
  it('false when fallback not configured', () => {
    expect(shouldAutoFailover(true, false, 'claude')).toBe(false)
  })
  it('false when already on fallback (no loop)', () => {
    expect(shouldAutoFailover(true, true, 'fallback')).toBe(false)
  })
})

describe('providerOverride', () => {
  it('claude → no override', () => {
    expect(providerOverride('claude', 'deepseek/deepseek-v4-pro', fb)).toEqual({})
  })
  it('fallback → model + env to CCR', () => {
    expect(providerOverride('fallback', 'deepseek/deepseek-v4-pro', fb)).toEqual({
      model: 'deepseek/deepseek-v4-pro',
      env: { ANTHROPIC_BASE_URL: 'http://localhost:3456', ANTHROPIC_AUTH_TOKEN: 'k', ANTHROPIC_API_KEY: '' },
    })
  })
  it('fallback but no fb config → no override (graceful)', () => {
    expect(providerOverride('fallback', 'deepseek/deepseek-v4-pro', null)).toEqual({})
  })
})
