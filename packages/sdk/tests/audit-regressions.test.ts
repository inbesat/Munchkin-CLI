import { describe, expect, it, spyOn } from 'bun:test'
import { ForgeClient } from '../src/client'
import { ForgeApiError } from '../src/errors'
import { SSEParser } from '../src/sse'
import { type StreamOptions, streamSSE } from '../src/stream'
import type { ParsedSSEFrame } from '../src/types'

function fetchResponse(response: Response): typeof fetch {
  return (async () => response) as typeof fetch
}

function iterator(options: StreamOptions = {}) {
  const result = streamSSE('http://sdk.invalid', options)
  if (!result || !('next' in result)) throw new Error('Expected an iterator')
  return result
}

function openStream(cancel: () => void | Promise<void> = () => {}) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: first\n\ndata: buffered\n\n'))
    },
    cancel,
  })
}

describe('SDK audit: SSE resource lifetime', () => {
  it('cancels the response body when a for-await consumer breaks', async () => {
    let cancellations = 0
    const body = openStream(() => {
      cancellations++
    })
    for await (const frame of iterator({ fetchImpl: fetchResponse(new Response(body)) })) {
      expect(frame.data).toBe('first')
      break
    }
    expect(cancellations).toBe(1)
    expect(body.locked).toBe(false)
  })

  it('cancels the body when the callback returns false', async () => {
    let cancellations = 0
    const body = openStream(() => {
      cancellations++
    })
    await streamSSE('http://sdk.invalid', {
      fetchImpl: fetchResponse(new Response(body)),
      handler: () => false,
    })
    expect(cancellations).toBe(1)
    expect(body.locked).toBe(false)
  })

  it('removes its abort listener after natural EOF', async () => {
    const controller = new AbortController()
    const remove = spyOn(controller.signal, 'removeEventListener')
    const frames: ParsedSSEFrame[] = []
    try {
      for await (const frame of iterator({
        signal: controller.signal,
        fetchImpl: fetchResponse(new Response('data: done\n\n')),
      }))
        frames.push(frame)
      expect(frames).toHaveLength(1)
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    } finally {
      remove.mockRestore()
    }
  })

  it('does not deliver buffered frames after an abort', async () => {
    const controller = new AbortController()
    const iter = iterator({
      signal: controller.signal,
      fetchImpl: fetchResponse(new Response(openStream())),
    })
    expect((await iter.next()).value?.data).toBe('first')
    controller.abort()
    expect((await iter.next()).done).toBe(true)
  })

  it('honors an abort that races with fetch completion', async () => {
    const controller = new AbortController()
    let cancellations = 0
    const body = openStream(() => {
      cancellations++
    })
    const fetchImpl = (async () => {
      controller.abort()
      return new Response(body)
    }) as typeof fetch
    const iter = iterator({ signal: controller.signal, fetchImpl })
    try {
      expect((await iter.next()).done).toBe(true)
      expect(cancellations).toBe(1)
    } finally {
      await iter.return()
    }
  })

  it('flushes the UTF-8 decoder at EOF before flushing a trailing frame', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: tail '))
        controller.enqueue(Uint8Array.of(0xe2, 0x82))
        controller.close()
      },
    })
    const frames: ParsedSSEFrame[] = []
    for await (const frame of iterator({ fetchImpl: fetchResponse(new Response(body)) })) {
      frames.push(frame)
    }
    expect(frames).toEqual([{ event: 'message', data: 'tail \ufffd' }])
  })

  it('returns callback completion so failures can be awaited', async () => {
    const failure = new Error('handler failed')
    let cancellations = 0
    const result = streamSSE('http://sdk.invalid', {
      fetchImpl: fetchResponse(
        new Response(
          openStream(() => {
            cancellations++
          }),
        ),
      ),
      handler: () => {
        throw failure
      },
    })
    expect(result).toBeInstanceOf(Promise)
    await expect(result).rejects.toBe(failure)
    expect(cancellations).toBe(1)
  })
})

describe('SDK audit: SSE field parsing', () => {
  it('handles bare CR and split CRLF without inventing blank lines', () => {
    const parser = new SSEParser()
    expect(parser.push('event: custom\r')).toEqual([])
    expect(parser.push('\ndata: one\r')).toEqual([])
    expect(parser.push('\ndata: two\r\r')).toEqual([{ event: 'custom', data: 'one\ntwo' }])
    expect(parser.push('\ndata: next\r\r')).toEqual([{ event: 'message', data: 'next' }])
  })

  it('ignores retry values that are not entirely ASCII digits', () => {
    const parser = new SSEParser()
    expect(parser.push('retry: 250\nretry: 100ms\nretry: +3\nretry: 2.5\ndata: x\n\n')).toEqual([
      { event: 'message', data: 'x', retry: 250 },
    ])
  })

  it('dispatches empty data and resets an empty event type to message', () => {
    const parser = new SSEParser()
    expect(parser.push('event:\ndata:\n\n')).toEqual([{ event: 'message', data: '' }])
  })

  it('persists and clears ids while rejecting NUL ids', () => {
    const parser = new SSEParser()
    expect(
      parser.push('id: old\n\ndata: one\n\nid: bad\u0000id\ndata: two\n\nid:\ndata: three\n\n'),
    ).toEqual([
      { event: 'message', data: 'one', id: 'old' },
      { event: 'message', data: 'two', id: 'old' },
      { event: 'message', data: 'three', id: '' },
    ])
  })
})

describe('SDK audit: HTTP boundaries', () => {
  it('sends configured headers on SSE requests without using the JSON Accept default', async () => {
    let headers = new Headers()
    const client = new ForgeClient({
      baseUrl: 'http://sdk.invalid',
      token: 'test-token',
      headers: { 'X-Tenant': 'test-tenant', Authorization: 'ignored' },
      fetchImpl: (async (_url, init) => {
        headers = new Headers(init?.headers)
        return new Response('')
      }) as typeof fetch,
    })
    const stream = client.sse.stream()
    if (!stream || !('next' in stream)) throw new Error('Expected an iterator')
    await stream.next()
    expect(headers.get('X-Tenant')).toBe('test-tenant')
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('Accept')).toBe('text/event-stream')
  })

  for (const body of [{}, null, [], { error: null }, { error: { code: 4, message: [] } }]) {
    it(`preserves HTTP status for a malformed error envelope: ${JSON.stringify(body)}`, async () => {
      const client = new ForgeClient({
        baseUrl: 'http://sdk.invalid',
        fetchImpl: fetchResponse(Response.json(body, { status: 502, statusText: 'Bad Gateway' })),
      })
      const failure = await client.health().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ForgeApiError)
      expect(failure).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' })
      expect((failure as Error).message).toContain('Bad Gateway')
    })
  }
})
