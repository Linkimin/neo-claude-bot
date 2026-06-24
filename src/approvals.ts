// Решение пользователя по запросу разрешения. Наш внутренний тип (без SDK-специфики).
export type ApprovalDecision = { allow: true } | { allow: false; message: string }

export function renderApprovalRequest(toolName: string, input: unknown): string {
  return `🔐 Нужно разрешение\n🔧 ${toolName} ${JSON.stringify(input).slice(0, 300)}`
}

export function parseApprovalCallback(data: string): { decision: 'approve' | 'deny'; id: string } | null {
  const m = /^appr:(approve|deny):(.+)$/.exec(data)
  if (!m) return null
  return { decision: m[1] as 'approve' | 'deny', id: m[2] }
}

// Реестр ожидающих апрувов: register() отдаёт promise, resolve() его завершает.
export class ApprovalRegistry {
  private seq = 0
  private readonly pending = new Map<string, (d: ApprovalDecision) => void>()

  register(): { id: string; promise: Promise<ApprovalDecision> } {
    const id = `a${++this.seq}`
    let resolve!: (d: ApprovalDecision) => void
    const promise = new Promise<ApprovalDecision>((r) => { resolve = r })
    this.pending.set(id, resolve)
    return { id, promise }
  }

  resolve(id: string, decision: 'approve' | 'deny'): boolean {
    const r = this.pending.get(id)
    if (!r) return false
    this.pending.delete(id)
    r(decision === 'approve' ? { allow: true } : { allow: false, message: 'Отклонено пользователем' })
    return true
  }
}
