export type RecoveryAction = 'continue' | 'restart' | 'cancel'

export function parseRecoveryCallback(data: string): { action: RecoveryAction; id: number } | null {
  const m = /^recover:(continue|restart|cancel):(\d+)$/.exec(data)
  if (!m) return null
  return { action: m[1] as RecoveryAction, id: Number(m[2]) }
}
