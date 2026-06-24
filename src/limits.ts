export type LimitClass = 'ok' | 'warning' | 'blocked'

export interface LimitSnapshot {
  window: string // 'five_hour' | 'seven_day'
  utilization: number // 0..1
  resetsAt: number // unix-секунды
  status: string
}

const BLOCKED_MARKERS = ['rejected', 'blocked', 'exceeded', 'exhausted']

// Защитная классификация: блокировка только по явным маркерам, иначе ok.
export function classifyLimit(status: string): LimitClass {
  const s = (status ?? '').toLowerCase()
  if (BLOCKED_MARKERS.some((m) => s.includes(m))) return 'blocked'
  if (s.includes('warning')) return 'warning'
  return 'ok'
}

// "18:40 (через 1ч 12м)" или "сейчас".
export function formatReset(resetsAt: number, now: number): string {
  const ms = resetsAt * 1000 - now
  if (ms <= 0) return 'сейчас'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  const when = new Date(resetsAt * 1000)
  const hh = String(when.getHours()).padStart(2, '0')
  const mm = String(when.getMinutes()).padStart(2, '0')
  const rel = h > 0 ? `${h}ч ${m}м` : `${m}м`
  return `${hh}:${mm} (через ${rel})`
}

function bar(util: number): string {
  const filled = Math.round(Math.max(0, Math.min(1, util)) * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

const WINDOW_LABEL: Record<string, string> = { five_hour: '5-часовое окно', seven_day: 'Недельное окно' }

export function renderLimits(snaps: LimitSnapshot[], now: number): string {
  if (snaps.length === 0) return '📊 Лимиты: данных пока нет (отправь любой промпт, чтобы их получить).'
  const lines = snaps.map((s) => {
    const label = WINDOW_LABEL[s.window] ?? s.window
    const pct = Math.round(s.utilization * 100)
    return `${label}: ${bar(s.utilization)} ${pct}%  сброс ${formatReset(s.resetsAt, now)}`
  })
  return '📊 Лимиты Claude\n' + lines.join('\n')
}
