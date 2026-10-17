import { DEFAULT_CONFIG, type Logger, getLogger } from '@forge/core'
import { Hono } from 'hono'
import { configSchema, createValidationMiddleware } from '../middleware/validation'
import { ConfigInputError, ConfigStore, configKeyParts } from '../services/config-store'
import type { ConfigRequest, ConfigResponse } from '../types'

/** Dotted keys address own properties; extension keys persist alongside typed settings. */
export function createConfigRoutes(logger?: Logger, baseDir?: string) {
  const log = logger ?? getLogger()
  const app = new Hono()
  const store = new ConfigStore(baseDir)
  app.onError((error, c) => {
    if (!(error instanceof ConfigInputError)) throw error
    return c.json({ error: { code: 'VALIDATION_ERROR', message: error.message } }, 400)
  })
  app.get('/', async (c) => c.json(await store.all()))
  app.get('/default', (c) => c.json(DEFAULT_CONFIG))
  app.get('/defaults/all', (c) => c.json(DEFAULT_CONFIG))
  app.get('/:key', async (c) => {
    const key = c.req.param('key')
    configKeyParts(key)
    const value = await store.get(key)
    if (value === undefined) {
      return c.json(
        { error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } },
        404,
      )
    }
    return c.json<ConfigResponse>({ key, value })
  })
  app.post('/', createValidationMiddleware(configSchema), async (c) => {
    const data = c.get('validatedData') as ConfigRequest
    await store.update(data.key, data.value, c.req.query('scope'))
    log.info('Config updated', { key: data.key })
    return c.json<ConfigResponse>(data)
  })
  app.delete('/:key', async (c) => {
    const key = c.req.param('key')
    if (!(await store.update(key, undefined, c.req.query('scope'), true))) {
      return c.json(
        { error: { code: 'CONFIG_NOT_FOUND', message: `Config key ${key} not found` } },
        404,
      )
    }
    log.info('Config deleted', { key })
    return c.json({ success: true })
  })
  return app
}
