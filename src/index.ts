import 'dotenv/config'
import { resolve } from 'node:path'
import { loadConfig } from './config.ts'
import { Registry } from './registry.ts'
import { Core } from './core.ts'
import { TopicMap } from './topics.ts'
import { ensureTopics } from './topicSetup.ts'
import { createBot } from './bot.ts'

async function main() {
  const config = loadConfig(process.env)
  const registry = Registry.fromFile(resolve('config/projects.json'))
  const topics = TopicMap.load(resolve('data/topics.json'))
  const core = new Core(registry)
  const bot = createBot(config, core, registry, topics)

  // На старте создаём недостающие темы (идемпотентно — существующие пропускаются).
  const created = await ensureTopics(bot.api, config.groupId, registry.names(), topics)
  if (created.length) console.log('Созданы темы:', created.join(', '))

  console.log('Бот запускается (long-polling)… группа:', config.groupId, '· user:', config.allowedUserId)
  await bot.start()
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
