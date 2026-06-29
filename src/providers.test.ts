import { describe, it, expect } from 'vitest'
import { providerOverride } from './providers.ts'

const fb = { ccrUrl: 'http://localhost:3456', authToken: 'k' }

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
