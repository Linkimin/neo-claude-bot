export type Provider = 'claude' | 'fallback'

export interface ProviderOverride {
  model?: string
  env?: Record<string, string>
}

// Override модели/окружения для прогона. claude → пусто (подписка как есть);
// fallback → перенаправление в локальный CCR + модель routerai.
export function providerOverride(
  provider: Provider,
  fallbackModel: string,
  fb: { ccrUrl: string; authToken: string } | null,
): ProviderOverride {
  if (provider === 'claude' || !fb) return {}
  return {
    model: fallbackModel,
    env: { ANTHROPIC_BASE_URL: fb.ccrUrl, ANTHROPIC_AUTH_TOKEN: fb.authToken, ANTHROPIC_API_KEY: '' },
  }
}

// Решение об авто-переключении на fallback при исчерпании лимита Claude. Чистая.
export function shouldAutoFailover(autoFailover: boolean, fallbackConfigured: boolean, current: Provider): boolean {
  return autoFailover && fallbackConfigured && current === 'claude'
}
