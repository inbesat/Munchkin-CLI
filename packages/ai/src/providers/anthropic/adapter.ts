import type {
  FinishReason,
  GenerateOptions,
  GenerateResult,
  Model,
  ModelCapabilities,
  ModelConfig,
  StreamChunk,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '../../model/types'

export interface AnthropicConfig {
  readonly provider?: string
  readonly name: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly config: ModelConfig
}

// ─── Internal Anthropic API types ─────────────────────────────

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicThinkingBlock {
  type: 'thinking'
  thinking: string
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicThinkingBlock | AnthropicToolUseBlock

interface AnthropicUserMessage {
  role: 'user'
  content: string | AnthropicContentBlock[]
}

interface AnthropicAssistantMessage {
  role: 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicMessage = AnthropicUserMessage | AnthropicAssistantMessage

interface AnthropicTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

interface AnthropicResponse {
  id: string
  type: string
  role: string
  content: AnthropicContentBlock[]
  model: string
  stop_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

interface AnthropicStreamEvent {
  type: string
  [key: string]: unknown
}

// ─── Message conversion ──────────────────────────────────────

export function convertMessages(
  messages: readonly import('../../model/types').ModelMessage[],
  system?: string,
): { system?: string; messages: AnthropicMessage[] } {
  const result: AnthropicMessage[] = []
  let systemPrompt = system

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic puts system as top-level; concatenate if multiple system messages
      if (systemPrompt) {
        systemPrompt += `\n${msg.content}`
      } else {
        systemPrompt = msg.content
      }
      continue
    }

    if (msg.role === 'user') {
      if (msg.toolResults && msg.toolResults.length > 0) {
        const blocks: Array<
          AnthropicContentBlock | { type: 'tool_result'; tool_use_id: string; content: string }
        > = []

        if (msg.content) {
          blocks.push({ type: 'text', text: msg.content })
        }

        for (const tr of msg.toolResults) {
          blocks.push({
            type: 'tool_result',
            tool_use_id: tr.toolCallId,
            content: tr.error ? `Error: ${tr.error}\n${tr.result}` : tr.result,
          })
        }

        result.push({
          role: 'user',
          content: blocks as AnthropicContentBlock[],
        })
        continue
      }

      result.push({ role: 'user', content: msg.content })
      continue
    }

    if (msg.role === 'assistant') {
      const content: AnthropicContentBlock[] = []

      if (msg.content) {
        content.push({ type: 'text', text: msg.content })
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args,
          })
        }
      }

      if (content.length > 0) {
        result.push({ role: 'assistant', content })
      }
    }
  }

  return { system: systemPrompt, messages: result }
}

// ─── Tool conversion ─────────────────────────────────────────

export function convertTools(tools: readonly ToolDefinition[]): AnthropicTool[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

// ─── Finish reason mapping ───────────────────────────────────

function mapFinishReason(reason: string | null): FinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'tool_use':
      return 'tool-call'
    case 'max_tokens':
      return 'length'
    default:
      return 'stop'
  }
}

// ─── Usage mapping ───────────────────────────────────────────

function mapUsage(usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}): TokenUsage {
  return {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
    total: usage.input_tokens + usage.output_tokens,
  }
}

// ─── Headers ─────────────────────────────────────────────────

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
}

// ─── SSE parser ──────────────────────────────────────────────

export function parseSSEEvent(eventLine: string, dataLine: string): AnthropicStreamEvent | null {
  if (!eventLine.startsWith('event: ')) return null
  if (!dataLine.startsWith('data: ')) return null
  const data = dataLine.slice(6)
  try {
    return JSON.parse(data) as AnthropicStreamEvent
  } catch {
    return null
  }
}

// ─── Model factory ───────────────────────────────────────────

export function createAnthropicModel(anthropicConfig: AnthropicConfig): Model {
  const provider = anthropicConfig.provider ?? 'anthropic'
  const { apiKey, config } = anthropicConfig
  const baseUrl = anthropicConfig.baseUrl ?? 'https://api.anthropic.com'

  // ── generate ──────────────────────────────────────────────

  async function doGenerate(options: GenerateOptions): Promise<GenerateResult> {
    const { system: sysPrompt, messages } = convertMessages(options.messages, options.system)

    const body: Record<string, unknown> = {
      model: config.name,
      max_tokens: options.maxTokens ?? config.defaultMaxTokens ?? 8192,
      messages,
    }

    if (sysPrompt) {
      body.system = sysPrompt
    }

    const tools = convertTools(options.tools ?? [])
    if (tools) {
      body.tools = tools
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    if (options.thinking) {
      const budgetTokens =
        typeof options.thinking === 'object' && options.thinking.budgetTokens
          ? options.thinking.budgetTokens
          : 10000
      body.thinking = { type: 'enabled', budget_tokens: budgetTokens }
    }

    const url = `${baseUrl}/v1/messages`
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`Anthropic API error ${resp.status}: ${errBody}`)
    }

    const data = (await resp.json()) as AnthropicResponse

    let text = ''
    let thinking: string | undefined
    const toolCalls: ToolCall[] = []

    for (const block of data.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'thinking') {
        thinking = block.thinking
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          args: block.input,
        })
      }
    }

    return {
      content: text,
      toolCalls,
      thinking,
      usage: mapUsage(data.usage),
      finishReason: mapFinishReason(data.stop_reason),
      model: data.model ?? config.name,
      provider,
    }
  }

  // ── stream ────────────────────────────────────────────────

  async function* doStream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const { system: sysPrompt, messages } = convertMessages(options.messages, options.system)

    const body: Record<string, unknown> = {
      model: config.name,
      max_tokens: options.maxTokens ?? config.defaultMaxTokens ?? 8192,
      messages,
      stream: true,
    }

    if (sysPrompt) {
      body.system = sysPrompt
    }

    const tools = convertTools(options.tools ?? [])
    if (tools) {
      body.tools = tools
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    if (options.thinking) {
      const budgetTokens =
        typeof options.thinking === 'object' && options.thinking.budgetTokens
          ? options.thinking.budgetTokens
          : 10000
      body.thinking = { type: 'enabled', budget_tokens: budgetTokens }
    }

    const url = `${baseUrl}/v1/messages`
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`Anthropic API error ${resp.status}: ${errBody}`)
    }

    if (!resp.body) {
      throw new Error('No response body for streaming')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Accumulator for tool calls (streamed as input_json_delta)
    const toolCallAccum = new Map<number, { id: string; name: string; args: string }>()

    // Usage tracking
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let cacheWriteTokens = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const lines = event.split('\n')
          let eventLine = ''
          let dataLine = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventLine = line
            } else if (line.startsWith('data: ')) {
              dataLine = line
            }
          }

          if (!eventLine || !dataLine) continue

          const parsed = parseSSEEvent(eventLine, dataLine)
          if (!parsed) continue

          // Anthropic SSE: event type is in the event: line, not in JSON data
          const eventType = eventLine.slice(7)
          switch (eventType) {
            case 'message_start': {
              const msg = parsed.message as
                | {
                    usage?: {
                      input_tokens?: number
                      cache_creation_input_tokens?: number
                      cache_read_input_tokens?: number
                    }
                  }
                | undefined
              if (msg?.usage) {
                inputTokens = msg.usage.input_tokens ?? 0
                cacheWriteTokens = msg.usage.cache_creation_input_tokens ?? 0
                cacheReadTokens = msg.usage.cache_read_input_tokens ?? 0
              }
              break
            }

            case 'content_block_start': {
              const index = parsed.index as number
              const block = parsed.content_block as
                | { type?: string; id?: string; name?: string }
                | undefined
              if (block?.type === 'tool_use') {
                const toolId = block.id ?? `tool_${index}`
                const toolName = block.name ?? ''
                toolCallAccum.set(index, { id: toolId, name: toolName, args: '' })
              }
              break
            }

            case 'content_block_delta': {
              const delta = parsed.delta as
                | { type?: string; text?: string; thinking?: string; partial_json?: string }
                | undefined
              if (delta?.type === 'text_delta' && delta.text) {
                yield { type: 'text-delta', delta: delta.text }
              } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                yield { type: 'thinking-delta', delta: delta.thinking }
              } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                const index = parsed.index as number
                const acc = toolCallAccum.get(index)
                if (acc) {
                  acc.args += delta.partial_json
                  yield {
                    type: 'tool-call-delta',
                    toolCallId: acc.id,
                    delta: delta.partial_json,
                  }
                }
              }
              break
            }

            case 'content_block_stop': {
              const index = parsed.index as number
              const acc = toolCallAccum.get(index)
              if (acc) {
                let parsedArgs: Record<string, unknown> = {}
                try {
                  parsedArgs = JSON.parse(acc.args)
                } catch {
                  // keep empty
                }
                yield {
                  type: 'tool-call',
                  toolCall: { id: acc.id, name: acc.name, args: parsedArgs },
                }
                toolCallAccum.delete(index)
              }
              break
            }

            case 'message_delta': {
              const delta = parsed.delta as { stop_reason?: string } | undefined
              const usage = parsed.usage as { output_tokens?: number } | undefined
              if (usage?.output_tokens) {
                outputTokens = usage.output_tokens
              }
              if (delta?.stop_reason) {
                yield {
                  type: 'usage',
                  usage: {
                    input: inputTokens,
                    output: outputTokens,
                    cacheRead: cacheReadTokens || undefined,
                    cacheWrite: cacheWriteTokens || undefined,
                    total: inputTokens + outputTokens,
                  },
                }
                yield { type: 'finish', reason: mapFinishReason(delta.stop_reason) }
              }
              break
            }

            case 'message_stop':
            case 'ping':
              // ignore
              break

            case 'error': {
              const errData = parsed.error as { message?: string } | undefined
              throw new Error(
                `Anthropic streaming error: ${errData?.message ?? JSON.stringify(parsed)}`,
              )
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split('\n')
        let eventLine = ''
        let dataLine = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) eventLine = line
          else if (line.startsWith('data: ')) dataLine = line
        }
        if (eventLine && dataLine) {
          const parsed = parseSSEEvent(eventLine, dataLine)
          const eventType = eventLine.slice(7)
          if (parsed && eventType === 'message_delta') {
            const delta = parsed.delta as { stop_reason?: string } | undefined
            const usage = parsed.usage as { output_tokens?: number } | undefined
            if (usage?.output_tokens) outputTokens = usage.output_tokens
            if (delta?.stop_reason) {
              yield {
                type: 'usage',
                usage: {
                  input: inputTokens,
                  output: outputTokens,
                  cacheRead: cacheReadTokens || undefined,
                  cacheWrite: cacheWriteTokens || undefined,
                  total: inputTokens + outputTokens,
                },
              }
              yield { type: 'finish', reason: mapFinishReason(delta.stop_reason) }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // ── returned model ────────────────────────────────────────

  return {
    id: `${provider}/${config.name}`,
    provider,
    name: config.name,
    config,

    generate: doGenerate,
    stream: doStream,

    supportsFeature(feature: keyof ModelCapabilities): boolean {
      const val = config.capabilities[feature]
      if (typeof val === 'boolean') return val
      if (typeof val === 'number') return val > 0
      return false
    },

    getCapabilities(): ModelCapabilities {
      return config.capabilities
    },
  }
}
