import 'dotenv/config'
import { resolve } from 'node:path'
import { loadConfig } from './config.ts'
import { Registry } from './registry.ts'
import { Core } from './core.ts'
import { createBot } from './bot.ts'

async function main() {
  const config = loadConfig(process.env)
  const registry = Registry.fromFile(resolve('config/projects.json'))
  const core = new Core(registry)
  const bot = createBot(config, core)

  console.log('Бот запускается (long-polling)… разрешённый user-id:', config.allowedUserId)
  await bot.start()
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
