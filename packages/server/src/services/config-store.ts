import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  DEFAULT_CONFIG, ForgeConfig, getGlobalConfigPath, getLocalConfigPath, getProjectConfigPath,
} from '@forge/core'

type ConfigObject = Record<string, unknown>
const pendingWrites = new Map<string, Promise<void>>()

export class ConfigInputError extends Error {}

function isObject(value: unknown): value is ConfigObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validSegment(key: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(key) && !Object.hasOwn(Object.prototype, key) && key !== 'prototype'
}

export function configKeyParts(key: string): string[] {
  const parts = key.split('.')
  if (!parts.every(validSegment)) throw new ConfigInputError('Invalid config key')
  return parts
}

/** Only own, safe properties participate in extension-key persistence. */
function merge(base: ConfigObject, override: ConfigObject): ConfigObject {
  const result: ConfigObject = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (!validSegment(key)) throw new ConfigInputError('Unsafe config property')
    result[key] = isObject(value) ? merge(isObject(result[key]) ? result[key] : {}, value) : value
    if (Array.isArray(value)) result[key] = value.map((v) => isObject(v) ? merge({}, v) : v)
  }
  return result
}

async function readConfig(file: string): Promise<ConfigObject> {
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!isObject(raw)) throw new ConfigInputError('Config must be an object')
    return merge({}, raw)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export class ConfigStore {
  constructor(private readonly cwd?: string) {}

  private path(scope = 'project'): string {
    if (scope === 'global') return getGlobalConfigPath()
    if (scope === 'local') return getLocalConfigPath(this.cwd)
    if (scope === 'project') return getProjectConfigPath(this.cwd)
    throw new ConfigInputError('Invalid config scope')
  }

  async all(): Promise<ConfigObject> {
    let config = merge({}, DEFAULT_CONFIG)
    for (const scope of ['global', 'project', 'local']) config = merge(config, await readConfig(this.path(scope)))
    return config
  }

  async get(key: string): Promise<unknown> {
    let value: unknown = await this.all()
    for (const part of configKeyParts(key)) {
      if (!isObject(value) || !Object.hasOwn(value, part)) return undefined
      value = value[part]
    }
    return value
  }

  async update(key: string, value: unknown, scope?: string, remove = false): Promise<boolean> {
    const parts = configKeyParts(key)
    const file = this.path(scope)
    const prior = pendingWrites.get(file) ?? Promise.resolve()
    const operation = prior.catch(() => {}).then(() => this.modify(file, parts, value, remove))
    const tail = operation.then(() => {}, () => {})
    pendingWrites.set(file, tail)
    try { return await operation } finally {
      if (pendingWrites.get(file) === tail) pendingWrites.delete(file)
    }
  }

  private async modify(file: string, parts: string[], value: unknown, remove: boolean): Promise<boolean> {
    const config = await readConfig(file)
    let target = config
    for (const part of parts.slice(0, -1)) {
      if (!isObject(target[part])) {
        if (remove) return false
        target[part] = {}
      }
      target = target[part] as ConfigObject
    }
    const last = parts[parts.length - 1]
    if (remove && !Object.hasOwn(target, last)) return false
    if (remove) delete target[last]
    else target[last] = value
    const safe = merge({}, config)
    if (!ForgeConfig.safeParse(merge(merge({}, DEFAULT_CONFIG), safe)).success) {
      throw new ConfigInputError('Invalid config value')
    }
    await this.write(file, safe)
    return true
  }

  private async write(file: string, config: ConfigObject): Promise<void> {
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 })
      await rename(temporary, file)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}
