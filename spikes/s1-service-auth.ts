import { query } from '@anthropic-ai/claude-agent-sdk'
import { writeFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'

const OUT = 'spikes/s1-out.txt'

async function main() {
  writeFileSync(OUT, `start ${new Date().toISOString()}\nhomedir=${homedir()}\ncwd=${process.cwd()}\n`)
  const q = query({ prompt: 'Reply with exactly: PONG', options: { permissionMode: 'default' } })
  for await (const m of q) {
    if (m.type === 'system' && m.subtype === 'init') {
      appendFileSync(OUT, `apiKeySource=${(m as any).apiKeySource}\n`)
    } else if (m.type === 'assistant') {
      for (const b of (m as any).message.content) {
        if (b.type === 'text') appendFileSync(OUT, `assistant=${b.text}\n`)
      }
    } else if (m.type === 'result') {
      appendFileSync(OUT, `result subtype=${(m as any).subtype} is_error=${(m as any).is_error}\n`)
    }
  }
  appendFileSync(OUT, 'DONE\n')
}

main().catch((e) => appendFileSync(OUT, 'ERROR ' + (e instanceof Error ? e.message : String(e)) + '\n'))
