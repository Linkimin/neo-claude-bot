import 'dotenv/config'
import { resolve } from 'node:path'
import { existsSync, renameSync } from 'node:fs'
import { run } from '@grammyjs/runner'
import { autoRetry } from '@grammyjs/auto-retry'
import { loadConfig } from './config.ts'
import { Registry } from './registry.ts'
import { Core } from './core.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { LimitsStore } from './limitsStore.ts'
import { RunStore } from './runStore.ts'
import { SpendStore } from './spendStore.ts'
import { getRouteraiBalance } from './routeraiBalance.ts'
import { FALLBACK_MODELS, DEFAULT_FALLBACK_MODEL } from './settings.ts'
import { CcrProcess, ensureCcrConfig } from './ccr.ts'
import { ensureTopics } from './topicSetup.ts'
import { createBot } from './bot.ts'
import { log } from './logger.ts'

async function main() {
  const config = loadConfig(process.env)

  // Разовый ренейм БД под бренд neo-claude-bot (data/ в gitignore, переносим существующие данные).
  const oldDbPath = resolve('data/claud-bot.sqlite')
  const dbPath = resolve('data/neo-claude-bot.sqlite')
  if (existsSync(oldDbPath) && !existsSync(dbPath)) {
    renameSync(oldDbPath, dbPath)
    log.info('БД переименована: claud-bot.sqlite -> neo-claude-bot.sqlite')
  }

  const registry = Registry.fromFile(resolve('config/projects.json'))
  const topics = TopicMap.load(resolve('data/topics.json'))
  const settings = SettingsStore.load(resolve('data/settings.json'))
  const sessions = new SessionStore(dbPath)
  const limits = new LimitsStore(dbPath)
  const runs = new RunStore(dbPath)
  const spend = new SpendStore(dbPath)

  const fallback = config.fallback ? { ccrUrl: config.fallback.ccrUrl, authToken: config.fallback.apiKey } : null
  const core = new Core(registry, settings, sessions, fallback)
  const bot = createBot(config, core, registry, topics, settings, sessions, limits, runs, spend)

  bot.api.config.use(autoRetry())

  // Локальный CCR-прокси для фолбэка (если настроен).
  let ccr: CcrProcess | null = null
  if (config.fallback) {
    ensureCcrConfig({
      baseUrl: config.fallback.baseUrl,
      apiKey: config.fallback.apiKey,
      port: config.fallback.ccrPort,
      models: FALLBACK_MODELS.map((m) => m.id),
      defaultModel: DEFAULT_FALLBACK_MODEL,
    })
    ccr = new CcrProcess('npx', ['ccr', 'start'], resolve('.'), {}, config.fallback.ccrUrl)
    await ccr.start()
  }

  // Периодический опрос баланса routerai → алерт при низком (дедуп: один раз при пересечении вниз).
  if (config.fallback && config.routeraiBalanceMin !== null) {
    let lowAlerted = false
    const min = config.routeraiBalanceMin
    const fbCfg = config.fallback
    const poll = async () => {
      const bal = await getRouteraiBalance(fbCfg.baseUrl, fbCfg.apiKey).catch(() => null)
      if (bal === null) return
      if (bal < min && !lowAlerted) {
        lowAlerted = true
        await bot.api.sendMessage(config.allowedUserId, `💸 Баланс routerai низкий: ${bal.toFixed(2)} кред. (порог ${min}).`).catch(() => {})
      } else if (bal >= min) {
        lowAlerted = false
      }
    }
    setInterval(() => { void poll() }, 30 * 60 * 1000)
    void poll()
  }

  const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
  if (created.length) log.info('Созданы темы:', created.join(', '))

  await bot.api.setMyCommands([
    { command: 'status', description: 'Статус проектов и сессий' },
    { command: 'limits', description: 'Остаток лимитов Claude' },
    { command: 'spend', description: 'Траты сегодня + баланс routerai' },
    { command: 'settings', description: 'Настройки: модель / effort / режим / провайдер' },
    { command: 'new', description: 'Новая сессия в этой теме' },
    { command: 'stop', description: 'Прервать текущий запрос' },
    { command: 'setup', description: 'Создать темы по проектам' },
    { command: 'start', description: 'Помощь' },
  ])

  log.info('Бот запускается (concurrent runner)… группа:', config.groupId, '· user:', config.allowedUserId, '· fallback:', config.fallback ? 'on' : 'off')
  const handle = run(bot)
  await bot.api.sendMessage(config.allowedUserId, '✅ Бот запущен').catch(() => {})

  const shutdown = async () => {
    log.info('Завершение…')
    try { await handle.stop() } catch { /* ignore */ }
    ccr?.stop()
    sessions.close(); limits.close(); runs.close(); spend.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((e) => { log.error('FATAL:', e instanceof Error ? e.message : String(e)); process.exit(1) })
