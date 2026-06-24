import 'dotenv/config'
import { resolve } from 'node:path'
import { run } from '@grammyjs/runner'
import { loadConfig } from './config.ts'
import { Registry } from './registry.ts'
import { Core } from './core.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { SessionStore } from './sessionStore.ts'
import { LimitsStore } from './limitsStore.ts'
import { ensureTopics } from './topicSetup.ts'
import { createBot } from './bot.ts'

async function main() {
  const config = loadConfig(process.env)
  const registry = Registry.fromFile(resolve('config/projects.json'))
  const topics = TopicMap.load(resolve('data/topics.json'))
  const settings = SettingsStore.load(resolve('data/settings.json'))
  const sessions = new SessionStore(resolve('data/claud-bot.sqlite'))
  const limits = new LimitsStore(resolve('data/claud-bot.sqlite'))
  const core = new Core(registry, settings, sessions)
  const bot = createBot(config, core, registry, topics, settings, sessions, limits)

  const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
  if (created.length) console.log('Созданы темы:', created.join(', '))

  await bot.api.setMyCommands([
    { command: 'status', description: 'Статус проектов и сессий' },
    { command: 'limits', description: 'Остаток лимитов Claude' },
    { command: 'settings', description: 'Настройки: модель / effort / режим' },
    { command: 'new', description: 'Новая сессия в этой теме' },
    { command: 'setup', description: 'Создать темы по проектам' },
    { command: 'start', description: 'Помощь' },
  ])

  console.log('Бот запускается (concurrent runner)… группа:', config.groupId, '· user:', config.allowedUserId)
  run(bot)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
