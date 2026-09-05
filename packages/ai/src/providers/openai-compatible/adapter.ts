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
} from '../../model/types'

export interface OpenAICompatibleConfig {
  readonly provider: string
  readonly name: string
  readonly baseUrl: string
  readonly apiKey: string
  readonly config: ModelConfig
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

interface OpenAIResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: OpenAIUsage
  model: string
}

interface OpenAIStreamDelta {
  id: string
  choices: Array<{
    delta: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: OpenAIUsage
  model: string
}

export function convertMessages(options: GenerateOptions): OpenAIMessage[] {
  const messages: OpenAIMessage[] = []

  if (options.system) {
    messages.push({ role: 'system', content: options.system })
  }

  for (const msg of options.messages) {
    if (msg.role === 'user' || msg.role === 'system') {
      messages.push({ role: msg.role, content: msg.content })
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const assistantMsg: OpenAIMessage = {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        }
        messages.push(assistantMsg)
      } else if (msg.content) {
        messages.push({ role: 'assistant', content: msg.content })
      }
    }

    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const tr of msg.toolResults) {
        messages.push({
          role: 'tool',
          content: tr.error ? `Error: ${tr.error}\n${tr.result}` : tr.result,
          tool_call_id: tr.toolCallId,
        })
      }
    }
  }

  return messages
}

export function convertTools(
  tools: readonly import('../../model/types').ToolDefinition[],
): OpenAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function mapFinishReason(reason: string | null): FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
    case 'function_call':
      return 'tool-call'
    case 'length':
    case 'max_tokens':
      return 'length'
    default:
      return 'stop'
  }
}

function mapUsage(usage: OpenAIUsage | undefined): TokenUsage {
  if (!usage) {
    return { input: 0, output: 0, total: 0 }
  }
  return {
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
    cacheRead: usage.prompt_tokens_details?.cached_tokens,
    total: usage.total_tokens,
  }
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

export function parseSSELine(line: string): OpenAIStreamDelta | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6)
  if (data === '[DONE]') return null
  try {
    return JSON.parse(data) as OpenAIStreamDelta
  } catch {
    return null
  }
}

export function createOpenAICompatibleModel(openAIConfig: OpenAICompatibleConfig): Model {
  const { provider, baseUrl, apiKey, config } = openAIConfig

  async function doGenerate(options: GenerateOptions): Promise<GenerateResult> {
    const messages = convertMessages(options)
    const body: Record<string, unknown> = {
      model: config.name,
      messages,
      stream: false,
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = convertTools(options.tools)
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    const url = `${baseUrl}/chat/completions`
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`OpenAI-compatible API error ${resp.status}: ${errBody}`)
    }

    const data = (await resp.json()) as OpenAIResponse
    const choice = data.choices[0]
    const message = choice?.message

    const toolCalls: ToolCall[] = []
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {
          // malformed args — keep empty
        }
        toolCalls.push({ id: tc.id, name: tc.function.name, args })
      }
    }

    const content = message?.content ?? ''
    const finishReason = mapFinishReason(choice?.finish_reason ?? null)
    const usage = mapUsage(data.usage)

    return {
      content,
      toolCalls,
      usage,
      finishReason,
      model: data.model ?? config.name,
      provider,
    }
  }

  async function* doStream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const messages = convertMessages(options)
    const body: Record<string, unknown> = {
      model: config.name,
      messages,
      stream: true,
    }
    if (options.tools && options.tools.length > 0) {
      body.tools = convertTools(options.tools)
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    const url = `${baseUrl}/chat/completions`
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`OpenAI-compatible API error ${resp.status}: ${errBody}`)
    }

    if (!resp.body) {
      throw new Error('No response body for streaming')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolCallAccum = new Map<number, { id: string; name: string; args: string }>()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const delta = parseSSELine(trimmed)
          if (!delta) {
            if (trimmed === 'data: [DONE]') {
              // handled by parseSSELine returning null — check explicitly
            }
            continue
          }

          const choice = delta.choices[0]
          if (!choice) continue

          const d = choice.delta

          if (d.content) {
            yield { type: 'text-delta', delta: d.content }
          }

          if (d.tool_calls) {
            for (const tc of d.tool_calls) {
              const idx = tc.index
              if (!toolCallAccum.has(idx)) {
                toolCallAccum.set(idx, {
                  id: tc.id ?? `call_${idx}`,
                  name: tc.function?.name ?? '',
                  args: '',
                })
              }
              const acc = toolCallAccum.get(idx)
              if (!acc) continue
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) {
                acc.args += tc.function.arguments
                yield {
                  type: 'tool-call-delta',
                  toolCallId: acc.id,
                  delta: tc.function.arguments,
                }
              }
            }
          }

          if (choice.finish_reason) {
            // Emit accumulated tool calls as final tool-call events
            for (const [, acc] of toolCallAccum) {
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
            }
            toolCallAccum.clear()

            if (delta.usage || (delta as unknown)) {
              // Some providers send usage in the final chunk
              const finalDelta = delta as unknown as { usage?: OpenAIUsage }
              if (finalDelta.usage) {
                yield { type: 'usage', usage: mapUsage(finalDelta.usage) }
              }
            }

            yield { type: 'finish', reason: mapFinishReason(choice.finish_reason) }
          }
        }
      }

      // Handle remaining buffer
      if (buffer.trim()) {
        const delta = parseSSELine(buffer.trim())
        if (delta) {
          const choice = delta.choices[0]
          if (choice?.delta?.content) {
            yield { type: 'text-delta', delta: choice.delta.content }
          }
          if (choice?.finish_reason) {
            for (const [, acc] of toolCallAccum) {
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
            }
            toolCallAccum.clear()
            yield { type: 'finish', reason: mapFinishReason(choice.finish_reason) }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

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
