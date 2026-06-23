import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const PROJECT = resolve('tmp/spike-project')

// Опционально: захардкодить id реальной GUI-сессии для ручного эксперимента (шаг 4 плана).
const RESUME_OVERRIDE = process.env.SPIKE_RESUME_ID

async function run(prompt: string, resumeId?: string): Promise<string | undefined> {
  let sessionId: string | undefined
  const q = query({
    prompt,
    options: {
      cwd: PROJECT,
      permissionMode: 'acceptEdits',
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
      ...(resumeId ? { resume: resumeId } : {}),
    },
  })
  for await (const msg of q) {
    sessionId = msg.session_id
    if (msg.type === 'assistant') {
      for (const b of msg.message.content) if (b.type === 'text') console.log('  >', b.text.slice(0, 200))
    }
  }
  return sessionId
}

async function main() {
  mkdirSync(PROJECT, { recursive: true })

  if (RESUME_OVERRIDE) {
    console.log('--- РУЧНОЙ режим: resume переданной сессии', RESUME_OVERRIDE, '---')
    const id = await run('What number did I ask you to remember? If you do not know, say "NO MEMORY".', RESUME_OVERRIDE)
    console.log('RESUMED_SESSION_ID =', id)
    return
  }

  console.log('--- Запуск 1: запоминаем число ---')
  const id = await run('Remember this number: 4242. Just acknowledge.')
  console.log('SESSION_ID =', id)

  console.log('--- Запуск 2: resume той же сессии ---')
  await run('What number did I ask you to remember?', id)
  // Ожидаем, что во втором запуске Claude вспомнит 4242 → значит resume сохраняет контекст.
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
