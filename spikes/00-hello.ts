import 'dotenv/config'
import { query } from '@anthropic-ai/claude-agent-sdk'

async function main() {
  const q = query({
    prompt: 'Reply with exactly the word: PONG',
    options: {
      // Без инструментов и без чтения настроек проекта — чистейший smoke.
      permissionMode: 'default',
    },
  })

  for await (const msg of q) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      console.log('[init] apiKeySource=', msg.apiKeySource, 'model=', msg.model)
    } else if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') console.log('[assistant]', block.text)
      }
    } else if (msg.type === 'result') {
      console.log('[result] subtype=', msg.subtype, 'is_error=', msg.is_error)
      console.log('[result] usage=', JSON.stringify(msg.usage))
      console.log('[result] cost_usd=', msg.total_cost_usd)
    }
  }
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e)
  process.exit(1)
})
