import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { query, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { logMessage } from './lib/log.ts'

const PROJECT = resolve('tmp/spike-project')

// Переключатель для шага 3 плана: 'allow' | 'deny'
const DECISION = (process.env.SPIKE_DECISION ?? 'allow') as 'allow' | 'deny'

async function main() {
  mkdirSync(PROJECT, { recursive: true })

  const q = query({
    // Мутирующее действие: правка файла. В режиме default обязано спросить разрешение.
    prompt: 'Append a line "perm-test" to note.txt using the Edit tool.',
    options: {
      cwd: PROJECT,
      permissionMode: 'default', // всё спрашивает
      tools: { type: 'preset', preset: 'claude_code' },
      settingSources: ['project'],
      canUseTool: async (toolName, input): Promise<PermissionResult> => {
        console.log('>>> canUseTool FIRED:', toolName, JSON.stringify(input))
        if (DECISION === 'deny') return { behavior: 'deny', message: 'spike denied' }
        return { behavior: 'allow', updatedInput: input }
      },
    },
  })

  for await (const msg of q) logMessage(msg)
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
