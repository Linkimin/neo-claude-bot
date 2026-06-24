export interface AppConfig {
  botToken: string
  allowedUserId: number
  groupId: number
  pin: string
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

  return { botToken, allowedUserId, groupId, pin }
}
