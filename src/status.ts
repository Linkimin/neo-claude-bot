import { MODELS } from './settings.ts'

export interface StatusItem {
  project: string
  mode: string
  model: string
  effort: string
  hasSession: boolean
  running: boolean
}

export function renderStatus(items: StatusItem[]): string {
  if (items.length === 0) return 'Нет проектов.'
  const lines = items.map((i) => {
    const flag = i.running ? '🟢 работает' : i.hasSession ? '🟡 сессия' : '⚪ idle'
    const modelLabel = MODELS.find((m) => m.id === i.model)?.label ?? i.model
    return `${flag} · ${i.project} · ${i.mode} · ${modelLabel} · ${i.effort}`
  })
  return '📊 Статус\n' + lines.join('\n')
}
