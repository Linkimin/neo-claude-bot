export interface FallbackConfig {
  apiKey: string
  baseUrl: string
  ccrPort: number
  ccrUrl: string
}

export interface AppConfig {
  botToken: string
  allowedUserId: number
  groupId: number
  pin: string
  fallback: FallbackConfig | null
  spendAlertUsd: number | null
  routeraiBalanceMin: number | null
}

// Принимает env-словарь явно (тестируемо); в проде передаём process.env.
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN
  if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN in environment')

  const rawId = env.TELEGRAM_USER_ID
  const allowedUserId = Number(rawId)
  if (!rawId || !Number.isInteger(allowedUserId)) {
    throw new Error('Missing or invalid TELEGRAM_USER_ID (must be an integer)')
  }

  const rawGroup = env.TELEGRAM_GROUP_ID
  const groupId = Number(rawGroup)
  if (!rawGroup || !Number.isInteger(groupId)) {
    throw new Error('Missing or invalid TELEGRAM_GROUP_ID (must be an integer)')
  }

  const pin = env.SETTINGS_PIN
  if (!pin) throw new Error('Missing SETTINGS_PIN in environment')

  let fallback: FallbackConfig | null = null
  const routeraiKey = env.ROUTERAI_API_KEY
  if (routeraiKey) {
    const baseUrl = env.ROUTERAI_BASE_URL
    if (!baseUrl) throw new Error('ROUTERAI_API_KEY set but ROUTERAI_BASE_URL missing')
    const ccrPort = Number(env.CCR_PORT ?? '3456')
    fallback = { apiKey: routeraiKey, baseUrl, ccrPort, ccrUrl: `http://localhost:${ccrPort}` }
  }

  const spendAlertUsd = env.SPEND_ALERT_USD ? Number(env.SPEND_ALERT_USD) : null
  const routeraiBalanceMin = env.ROUTERAI_BALANCE_MIN ? Number(env.ROUTERAI_BALANCE_MIN) : null

  return { botToken, allowedUserId, groupId, pin, fallback, spendAlertUsd, routeraiBalanceMin }
}
