import { readFileSync } from 'node:fs'

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default'

export interface Project {
  name: string
  dir: string
  defaultMode: PermissionMode
}

export class Registry {
  constructor(private readonly projects: Project[]) {}

  static fromFile(path: string): Registry {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Project[]
    return new Registry(raw)
  }

  get(name: string): Project {
    const p = this.projects.find((x) => x.name === name)
    if (!p) throw new Error(`unknown project: ${name}`)
    return p
  }

  names(): string[] {
    return this.projects.map((p) => p.name)
  }
}
