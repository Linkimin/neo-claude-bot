import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const PROJECT = resolve('tmp/spike-project')

async function main() {
  mkdirSync(PROJECT, { recursive: true })

  const q = query({
    // Лёгкое реальное действие, чтобы прошёл полный цикл и прилетел rate_limit_event.
    prompt: 'Use the Bash tool to run: echo limits-probe',
    options: {
      cwd: PROJECT,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
    },
  })

  for await (const msg of q) {
    // Главная цель: вскрыть форму rate_limit_event (вероятный источник данных о лимитах).
    if ((msg as any).type === 'rate_limit_event') {
      console.log('[RATE_LIMIT_EVENT FULL]', JSON.stringify(msg, null, 2))
    }
    if (msg.type === 'system' && msg.subtype === 'init') {
      console.log('[init keys]', Object.keys(msg).join(', '))
    }
    if (msg.type === 'result') {
      console.log('[result keys]', Object.keys(msg).join(', '))
    }
  }
}

main().catch((e) => {
  // Если когда-нибудь поймаем реальную лимит-ошибку — её форма здесь.
  console.error('[ERROR FULL]', JSON.stringify(e, Object.getOwnPropertyNames(e), 2))
  process.exit(1)
})
