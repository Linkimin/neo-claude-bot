import type { PermissionMode } from './registry.ts'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export interface ProjectSettings {
  mode: PermissionMode
  model: string
  effort: EffortLevel
  fallbackModel: string
  autoFailover: boolean
}

export const MODELS = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
] as const

export const DEFAULT_MODEL = 'claude-sonnet-5'

// Модели routerai для фолбэка (id — формат routerai, подтверждены спайком).
export const FALLBACK_MODELS = [
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2' },
] as const
export const DEFAULT_FALLBACK_MODEL: string = FALLBACK_MODELS[0].id

export const EFFORTS: EffortLevel[] = ['low', 'medium', 'high', 'max']
export const EFFORT_THINKING: Record<EffortLevel, number> = { low: 4000, medium: 12000, high: 32000, max: 60000 }
export const DEFAULT_EFFORT: EffortLevel = 'medium'

export type SettingAction = { kind: 'model' | 'effort' | 'mode' | 'fallback' | 'autofailover'; value: string }

// Разбор callback_data вида "set:<kind>:<value>". Чистая функция.
export function parseSettingAction(data: string): SettingAction | null {
  const m = /^set:(model|effort|mode|fallback|autofailover):(.+)$/.exec(data)
  if (!m) return null
  return { kind: m[1] as SettingAction['kind'], value: m[2] }
}

// Валидирует действие и возвращает патч настроек (или null). Auto через кнопки запрещён.
export function settingPatch(a: SettingAction): Partial<ProjectSettings> | null {
  if (a.kind === 'model') return MODELS.some((m) => m.id === a.value) ? { model: a.value } : null
  if (a.kind === 'effort') return (EFFORTS as string[]).includes(a.value) ? { effort: a.value as EffortLevel } : null
  if (a.kind === 'mode') return a.value === 'acceptEdits' || a.value === 'default' ? { mode: a.value as PermissionMode } : null
  if (a.kind === 'fallback') return FALLBACK_MODELS.some((m) => m.id === a.value) ? { fallbackModel: a.value } : null
  if (a.kind === 'autofailover') return a.value === 'on' || a.value === 'off' ? { autoFailover: a.value === 'on' } : null
  return null
}

export function renderSettings(s: ProjectSettings): string {
  const label = MODELS.find((m) => m.id === s.model)?.label ?? s.model
  const fbLabel = FALLBACK_MODELS.find((m) => m.id === s.fallbackModel)?.label ?? s.fallbackModel
  return `⚙️ Настройки\nРежим: ${s.mode}\nМодель: ${label}\nEffort: ${s.effort}\nФолбэк-модель: ${fbLabel}\nАвто-фолбэк: ${s.autoFailover ? 'вкл' : 'выкл'}`
}

export function checkPin(input: string, pin: string): boolean {
  return input.trim() === pin
}
