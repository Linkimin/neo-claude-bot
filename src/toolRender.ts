import { esc } from './mdToHtml.ts'

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…'
}

export function renderDiff(oldStr: string, newStr: string, maxLines = 30): string {
  const rows: string[] = []
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  for (const l of oldLines.slice(0, maxLines)) rows.push('- ' + l)
  if (oldLines.length > maxLines) rows.push(`… (+${oldLines.length - maxLines} строк)`)
  for (const l of newLines.slice(0, maxLines)) rows.push('+ ' + l)
  if (newLines.length > maxLines) rows.push(`… (+${newLines.length - maxLines} строк)`)
  return `<pre>${esc(rows.join('\n'))}</pre>`
}

export function renderToolUse(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>
  const path = typeof i.file_path === 'string' ? i.file_path : ''
  switch (name) {
    case 'Bash':
      return `🔧 <b>Bash</b>\n<pre>${esc(truncate(String(i.command ?? ''), 1500))}</pre>`
    case 'Read':
      return `📖 <b>Read</b> <code>${esc(path)}</code>`
    case 'Write':
      return `📝 <b>Write</b> <code>${esc(path)}</code>`
    case 'Edit':
      return `✏️ <b>Edit</b> <code>${esc(path)}</code>\n${renderDiff(String(i.old_string ?? ''), String(i.new_string ?? ''))}`
    case 'MultiEdit': {
      const edits = Array.isArray(i.edits) ? (i.edits as Array<Record<string, unknown>>) : []
      const diffs = edits.slice(0, 5).map((e) => renderDiff(String(e.old_string ?? ''), String(e.new_string ?? ''))).join('\n')
      return `✏️ <b>MultiEdit</b> <code>${esc(path)}</code> (${edits.length})\n${diffs}`
    }
    case 'Glob':
    case 'Grep':
      return `🔍 <b>${name}</b> <code>${esc(String(i.pattern ?? ''))}</code>`
    default:
      return `🔧 <b>${esc(name)}</b> <code>${esc(truncate(JSON.stringify(i), 200))}</code>`
  }
}
