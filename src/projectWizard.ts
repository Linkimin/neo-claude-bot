import type { PermissionMode } from './registry.ts'

export const PAGE_SIZE = 8

// Чистая стейт-машина мастера добавления проекта. I/O (mkdir, createForumTopic,
// отправка сообщений) делает bot — wizard только хранит/переводит состояние.
export type WizardState =
  | { stage: 'pickRoot'; roots: string[] }
  | { stage: 'browse'; roots: string[]; rootPath: string; currentPath: string; page: number; awaitingNewFolder?: boolean }
  | { stage: 'awaitLabel'; dir: string }
  | { stage: 'pickMode'; dir: string; label: string }
  | { stage: 'done'; dir: string; label: string; defaultMode: PermissionMode }

export function startWizard(roots: string[]): WizardState {
  if (roots.length === 1) {
    return { stage: 'browse', roots, rootPath: roots[0], currentPath: roots[0], page: 0 }
  }
  return { stage: 'pickRoot', roots }
}

export function selectRoot(s: WizardState, idx: number): WizardState {
  if (s.stage !== 'pickRoot') return s
  const root = s.roots[idx]
  if (!root) return s
  return { stage: 'browse', roots: s.roots, rootPath: root, currentPath: root, page: 0 }
}

export function enterSegment(s: WizardState, segment: string, resolve: (segment: string) => string | null): WizardState {
  if (s.stage !== 'browse') return s
  const next = resolve(segment)
  if (next === null) return s
  return { ...s, currentPath: next, page: 0, awaitingNewFolder: false }
}

export function goUp(s: WizardState, resolve: (segment: string) => string | null): WizardState {
  if (s.stage !== 'browse') return s
  const next = resolve('..')
  if (next === null) return s
  return { ...s, currentPath: next, page: 0, awaitingNewFolder: false }
}

export function setPage(s: WizardState, page: number): WizardState {
  if (s.stage !== 'browse') return s
  return { ...s, page: Math.max(0, page) }
}

export function selectCurrent(s: WizardState): WizardState {
  if (s.stage !== 'browse') return s
  return { stage: 'awaitLabel', dir: s.currentPath }
}

export function awaitNewFolder(s: WizardState): WizardState {
  if (s.stage !== 'browse') return s
  return { ...s, awaitingNewFolder: true }
}

export function setLabel(s: WizardState, label: string): WizardState {
  if (s.stage !== 'awaitLabel') return s
  return { stage: 'pickMode', dir: s.dir, label: label.trim() }
}

export function setMode(s: WizardState, mode: PermissionMode): WizardState {
  if (s.stage !== 'pickMode') return s
  return { stage: 'done', dir: s.dir, label: s.label, defaultMode: mode }
}
