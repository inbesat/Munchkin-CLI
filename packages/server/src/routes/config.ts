import { Hono } from 'hono'
import { createValidationMiddleware, configSchema } from '../middleware/validation'
import type { ConfigRequest, ConfigResponse } from '../types'
import { loadConfig, getProjectConfigPath, getGlobalConfigPath, getLocalConfigPath, DEFAULT_CONFIG, type ForgeConfig } from '@forge/core'
import { Logger, getLogger } from '@forge/core'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export function createConfigRoutes(logger?: Logger, baseDir?: string) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.get('/', async (c) => {
    const result = await loadConfig({ cwd: baseDir })
    return c.json(result.config)
  })

  app.get('/default', async (c) => {
    return c.json(DEFAULT_CONFIG)
  })

  app.get('/:key', async (c) => {
    const key = c.req.param('key')
    const result = await loadConfig({ cwd: baseDir })
    const config = result.config
    const keys = key.split('.')
    let value: unknown = config
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k]
      } else {
        return c.json({ error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } }, 404)
      }
    }
    return c.json<ConfigResponse>({ key, value })
  })

  app.post('/', createValidationMiddleware(configSchema), async (c) => {
    const data = c.get('validatedData') as ConfigRequest
    const scope = c.req.query('scope') ?? 'project'

    let configPath: string
    switch (scope) {
      case 'global':
        configPath = getGlobalConfigPath()
        break
      case 'local':
        configPath = getLocalConfigPath(baseDir)
        break
      case 'project':
      default:
        configPath = getProjectConfigPath(baseDir)
        break
    }

    const dir = path.dirname(configPath)
    await fs.mkdir(dir, { recursive: true })

    let existingConfig: Partial<ForgeConfig> = {}
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      existingConfig = JSON.parse(content)
    } catch {
      // File doesn't exist, use empty config
    }

    const keys = data.key.split('.')
    let target: Record<string, unknown> = existingConfig
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      if (!(k in target) || typeof target[k] !== 'object' || target[k] === null) {
        target[k] = {}
      }
      target = target[k] as Record<string, unknown>
    }
    target[keys[keys.length - 1]] = data.value

    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2))

    log.info('Config updated', { key: data.key, scope })
    return c.json<ConfigResponse>({ key: data.key, value: data.value })
  })

  app.delete('/:key', async (c) => {
    const key = c.req.param('key')
    const scope = c.req.query('scope') ?? 'project'

    let configPath: string
    switch (scope) {
      case 'global':
        configPath = getGlobalConfigPath()
        break
      case 'local':
        configPath = getLocalConfigPath(baseDir)
        break
      case 'project':
      default:
        configPath = getProjectConfigPath(baseDir)
        break
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8')
      const config = JSON.parse(content)

      const keys = key.split('.')
      let target: Record<string, unknown> = config
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        if (!(k in target) || typeof target[k] !== 'object' || target[k] === null) {
          return c.json({ error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } }, 404)
        }
        target = target[k] as Record<string, unknown>
      }

      if (!(keys[keys.length - 1] in target)) {
        return c.json({ error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } }, 404)
      }

      delete target[keys[keys.length - 1]]
      await fs.writeFile(configPath, JSON.stringify(config, null, 2))

      log.info('Config deleted', { key, scope })
      return c.json({ success: true })
    } catch {
      return c.json({ error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } }, 404)
    }
  })

  app.get('/defaults/all', (c) => {
    return c.json(DEFAULT_CONFIG)
  })

  return app
}