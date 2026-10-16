/**
 * Mock MCP server fixture (Phase 117 tests): a real, spawnable MCP server
 * speaking newline-delimited JSON-RPC over stdio. Not a test file itself -
 * the client tests spawn it with `bun run`.
 *
 * Tools: echo(message), add(a, b), slow(delay - sleeps, for timeout tests),
 * fail(message - returns isError). Sends one unsolicited notification
 * after initialize to prove notifications never desync the client.
 */

interface MockServerRequest {
  jsonrpc: string
  id?: number
  method?: string
  params?: Record<string, unknown>
}

const SERVER_INFO = { serverInfo: { name: 'forge-mock-mcp', version: '1.0.0' } }

const TOOLS = [
  {
    name: 'echo',
    description: 'Echoes the message back',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'add',
    description: 'Adds two numbers',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
  },
  {
    name: 'slow',
    description: 'Sleeps `delay` ms before replying (timeout tests)',
    inputSchema: { type: 'object', properties: { delay: { type: 'number' } } },
  },
  {
    name: 'fail',
    description: 'Always returns an error result',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
  },
]

function respond(message: MockServerRequest, result: unknown): void {
  if (typeof message.id !== 'number') return
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
}

async function main(): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true })
    let newlineAt = buffer.indexOf('\n')
    while (newlineAt !== -1) {
      const line = buffer.slice(0, newlineAt).trim()
      buffer = buffer.slice(newlineAt + 1)
      if (line.length > 0) handle(line)
      newlineAt = buffer.indexOf('\n')
    }
  }
}

function handle(line: string): void {
  let message: MockServerRequest
  try {
    message = JSON.parse(line) as MockServerRequest
  } catch {
    return
  }
  if (message.id === undefined || message.method === undefined) return

  switch (message.method) {
    case 'initialize':
      respond(message, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        ...SERVER_INFO,
      })
      // Unsolicited notification right after the handshake.
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { step: 1 } })}\n`,
      )
      break
    case 'tools/list':
      respond(message, { tools: TOOLS })
      break
    case 'tools/call': {
      const name = String(message.params?.name ?? '')
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>
      if (name === 'echo') {
        respond(message, {
          content: [{ type: 'text', text: String(args.message ?? '') }],
          isError: false,
        })
      } else if (name === 'add') {
        respond(message, {
          content: [{ type: 'text', text: String(Number(args.a ?? 0) + Number(args.b ?? 0)) }],
          isError: false,
        })
      } else if (name === 'slow') {
        setTimeout(
          () => {
            process.stdout.write(
              `${JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: { content: [{ type: 'text', text: 'finally' }], isError: false },
              })}\n`,
            )
          },
          Number(args.delay ?? 500),
        )
      } else if (name === 'fail') {
        respond(message, {
          content: [{ type: 'text', text: String(args.message ?? 'boom') }],
          isError: true,
        })
      } else {
        respond(message, {
          content: [{ type: 'text', text: `unknown tool ${name}` }],
          isError: true,
        })
      }
      break
    }
    default:
      respond(message, { error: { code: -32601, message: `unknown method ${message.method}` } })
  }
}

void main()
