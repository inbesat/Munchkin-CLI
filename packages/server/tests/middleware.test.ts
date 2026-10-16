import { describe, expect, it } from 'bun:test'
import { ForgeError } from '@forge/core'
import { ErrorCode } from '@forge/core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { errorToResponse } from '../src/middleware/error-handler'
import { createValidationMiddleware } from '../src/middleware/validation'

describe('createValidationMiddleware', () => {
  const schema = z.object({ name: z.string().min(1) })
  const makeApp = () => {
    const app = new Hono()
    app.post('/x', createValidationMiddleware(schema), (c) => {
      const data = c.get('validatedData') as { name: string }
      return c.json({ ok: true, name: data.name })
    })
    return app
  }

  it('passes valid input', async () => {
    const app = makeApp()
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'abc' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('abc')
  })

  it('rejects invalid input with VALIDATION_ERROR', async () => {
    const app = makeApp()
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('errorToResponse', () => {
  it('maps HTTPException to its status', () => {
    const { response, status } = errorToResponse(new HTTPException(404, { message: 'nope' }))
    expect(status).toBe(404)
    expect(response.error.code).toBe('HTTP_ERROR')
  })

  it('maps ForgeError to a 4xx/5xx status', () => {
    const { response, status } = errorToResponse(
      new ForgeError(ErrorCode.SESSION_NOT_FOUND, 'missing'),
    )
    expect(status).toBe(404)
    expect(response.error.code).toBe(ErrorCode.SESSION_NOT_FOUND)
  })

  it('maps unknown errors to 500', () => {
    const { response, status } = errorToResponse(new Error('boom'))
    expect(status).toBe(500)
    expect(response.error.code).toBe('INTERNAL_ERROR')
  })
})
