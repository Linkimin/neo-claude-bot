// Реальный баланс routerai. Подтверждено спайком: GET <base>/credits → {data:{credits}}.
export async function getRouteraiBalance(baseUrl: string, apiKey: string, fetchFn: typeof fetch = fetch): Promise<number> {
  const url = baseUrl.replace(/\/$/, '') + '/credits'
  const r = await fetchFn(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const body = (await r.json()) as { data?: { credits?: number } }
  const c = body?.data?.credits
  if (typeof c !== 'number') throw new Error('routerai: unexpected balance response')
  return c
}
