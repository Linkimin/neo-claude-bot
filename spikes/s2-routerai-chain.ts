import 'dotenv/config'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const PROJECT = resolve('tmp/spike-project')
const MODEL = process.env.DEEPSEEK_ID ?? 'deepseek/deepseek-v4-pro'
const CCR = 'http://localhost:3456'

async function main() {
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(resolve(PROJECT, 'note.txt'), 'routerai spike base line\n')

  console.log('=== provider=routerai model=', MODEL, 'via', CCR, '===')
  const q = query({
    prompt: 'Read note.txt in the current directory, then append a line "routerai ok" to it. Then tell me in one sentence what you did.',
    options: {
      cwd: PROJECT,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
      model: MODEL,
      env: { ANTHROPIC_BASE_URL: CCR, ANTHROPIC_AUTH_TOKEN: 'ccr-dummy', ANTHROPIC_API_KEY: '' },
    },
  })

  for await (const m of q) {
    if (m.type === 'system' && m.subtype === 'init') {
      console.log('[init] model=', (m as any).model, 'apiKeySource=', (m as any).apiKeySource)
    } else if (m.type === 'assistant') {
      for (const b of (m as any).message.content) {
        if (b.type === 'text') console.log('[text]', b.text.slice(0, 300))
        else if (b.type === 'tool_use') console.log('[tool_use]', b.name, JSON.stringify(b.input).slice(0, 120))
      }
    } else if (m.type === 'result') {
      console.log('[result] subtype=', (m as any).subtype, 'is_error=', (m as any).is_error, 'turns=', (m as any).num_turns)
    }
  }
  console.log('=== note.txt после ===')
  console.log(readFileSync(resolve(PROJECT, 'note.txt'), 'utf8'))
}

main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : String(e)); process.exit(1) })
