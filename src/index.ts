import 'dotenv/config'
import { resolve } from 'node:path'
import { run } from '@grammyjs/runner'
import { loadConfig } from './config.ts'
import { Registry } from './registry.ts'
import { Core } from './core.ts'
import { TopicMap } from './topics.ts'
import { SettingsStore } from './settingsStore.ts'
import { ensureTopics } from './topicSetup.ts'
import { createBot } from './bot.ts'

async function main() {
  const config = loadConfig(process.env)
  const registry = Registry.fromFile(resolve('config/projects.json'))
  const topics = TopicMap.load(resolve('data/topics.json'))
  const settings = SettingsStore.load(resolve('data/settings.json'))
  const core = new Core(registry, settings)
  const bot = createBot(config, core, registry, topics, settings)

  const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
  if (created.length) console.log('Созданы темы:', created.join(', '))

  // @grammyjs/runner — конкурентная обработка апдейтов.
  // Нужно, чтобы нажатие кнопки апрува обрабатывалось, пока обработчик промпта ждёт решение.
  console.log('Бот запускается (concurrent runner)… группа:', config.groupId, '· user:', config.allowedUserId)
  run(bot)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
