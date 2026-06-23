import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { logMessage } from './lib/log.ts'

const PROJECT = resolve('tmp/spike-project')

async function main() {
  // Готовим изолированную папку-«проект» с одним файлом, который Claude может прочитать/изменить.
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(resolve(PROJECT, 'note.txt'), 'hello from spike\n')

  let sessionId: string | undefined
  const q = query({
    prompt: 'Read note.txt and tell me its contents. Then append a second line "edited by spike" to it.',
    options: {
      cwd: PROJECT,
      permissionMode: 'acceptEdits', // правки файлов проходят сами
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],   // чтобы вёл себя как реальный проект (CLAUDE.md и т.п.)
    },
  })

  for await (const msg of q) {
    sessionId = msg.session_id
    logMessage(msg)
  }
  console.log('SESSION_ID =', sessionId)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
