import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { PermissionMode } from './registry.ts'
import { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_FALLBACK_MODEL, type ProjectSettings } from './settings.ts'

// Персист частичных переопределений настроек per-project в data/settings.json.
// effective() склеивает их с дефолтами.
export class SettingsStore {
  private constructor(
    private readonly path: string,
    private readonly data: Record<string, Partial<ProjectSettings>>,
  ) {}

  static load(path: string): SettingsStore {
    const data = existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, Partial<ProjectSettings>>)
      : {}
    return new SettingsStore(path, data)
  }

  effective(project: string, defaultMode: PermissionMode): ProjectSettings {
    const o = this.data[project] ?? {}
    return {
      mode: o.mode ?? defaultMode,
      model: o.model ?? DEFAULT_MODEL,
      effort: o.effort ?? DEFAULT_EFFORT,
      fallbackModel: o.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
      autoFailover: o.autoFailover ?? false,
    }
  }

  set(project: string, patch: Partial<ProjectSettings>): void {
    this.data[project] = { ...(this.data[project] ?? {}), ...patch }
    this.save()
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }
}
