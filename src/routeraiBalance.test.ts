import { describe, it, expect } from 'vitest'
import { getRouteraiBalance } from './routeraiBalance.ts'

function fakeFetch(body: unknown): typeof fetch {
  return (async () => ({ json: async () => body })) as unknown as typeof fetch
}

describe('getRouteraiBalance', () => {
  it('reads data.credits and strips trailing slash from base', async () => {
    let seenUrl = ''
    const f = (async (url: string) => { seenUrl = url; return { json: async () => ({ data: { credits: 22.5 } }) } }) as unknown as typeof fetch
    const bal = await getRouteraiBalance('https://routerai.ru/api/v1/', 'k', f)
    expect(bal).toBe(22.5)
    expect(seenUrl).toBe('https://routerai.ru/api/v1/credits')
  })
  it('throws on unexpected shape', async () => {
    await expect(getRouteraiBalance('https://x/api/v1', 'k', fakeFetch({ oops: true }))).rejects.toThrow(/balance/)
  })
})
