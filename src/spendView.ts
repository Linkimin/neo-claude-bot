import type { SpendRow } from './spendStore.ts'

export function renderSpend(rows: SpendRow[], balanceCredits: number | null): string {
  const head = '💰 Траты сегодня (оценка по токенам)'
  const balLine = balanceCredits === null ? '' : `\n💳 Баланс routerai: ${balanceCredits.toFixed(2)} кред.`
  if (rows.length === 0) return `${head}\nсегодня трат нет.${balLine}`
  const lines = rows.map((r) => `• ${r.project} · ${r.provider}: $${r.totalUsd.toFixed(2)}`)
  const total = rows.reduce((s, r) => s + r.totalUsd, 0)
  return `${head}\n${lines.join('\n')}\nИтого: $${total.toFixed(2)}${balLine}`
}
