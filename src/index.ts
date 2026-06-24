import 'dotenv/config'
import { resolve } from 'node:path'
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
import { ensureTopics } from './topicSetup.ts'
import { createBot } from './bot.ts'
import { log } from './logger.ts'

async function main() {
  const config = loadConfig(process.env)
  const registry = Registry.fromFile(resolve('config/projects.json'))
  const topics = TopicMap.load(resolve('data/topics.json'))
  const settings = SettingsStore.load(resolve('data/settings.json'))
  const sessions = new SessionStore(resolve('data/claud-bot.sqlite'))
  const limits = new LimitsStore(resolve('data/claud-bot.sqlite'))
  const runs = new RunStore(resolve('data/claud-bot.sqlite'))
  const core = new Core(registry, settings, sessions)
  const bot = createBot(config, core, registry, topics, settings, sessions, limits, runs)

  // Авто-повтор Telegram-запросов на 429/5xx (троттлинг/блипы).
  bot.api.config.use(autoRetry())

  const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
  if (created.length) log.info('Созданы темы:', created.join(', '))

  await bot.api.setMyCommands([
    { command: 'status', description: 'Статус проектов и сессий' },
    { command: 'limits', description: 'Остаток лимитов Claude' },
    { command: 'settings', description: 'Настройки: модель / effort / режим' },
    { command: 'new', description: 'Новая сессия в этой теме' },
    { command: 'setup', description: 'Создать темы по проектам' },
    { command: 'start', description: 'Помощь' },
  ])

  log.info('Бот запускается (concurrent runner)… группа:', config.groupId, '· user:', config.allowedUserId)
  const handle = run(bot)
  await bot.api.sendMessage(config.allowedUserId, '✅ Бот запущен').catch(() => {})

  const shutdown = async () => {
    log.info('Завершение…')
    try { await handle.stop() } catch { /* ignore */ }
    sessions.close(); limits.close(); runs.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

main().catch((e) => { log.error('FATAL:', e instanceof Error ? e.message : String(e)); process.exit(1) })
