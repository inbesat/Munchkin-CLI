import type {
  FinishReason,
  GenerateOptions,
  GenerateResult,
  Model,
  ModelCapabilities,
  ModelConfig,
  ModelMessage,
  StreamChunk,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from '../../model/types'

export interface AzureConfig {
  provider?: string
  name: string
  apiKey: string
  endpoint: string
  apiVersion?: string
  deploymentName?: string
  config: ModelConfig
}

interface AzureMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface AzureTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface AzureResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: AzureMessage
    finish_reason: string | null
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface AzureStreamChoice {
  index: number
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
}

interface AzureStreamResponse {
  id: string
  object: string
  created: number
  model: string
  choices: AzureStreamChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

function mapFinishReason(reason: string | null): FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
      return 'tool-call'
    case 'length':
      return 'length'
    case 'content_filter':
      return 'error'
    default:
      return 'stop'
  }
}

function convertMessages(messages: readonly ModelMessage[], system?: string): AzureMessage[] {
  const result: AzureMessage[] = []

  if (system) {
    result.push({ role: 'system', content: system })
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.push({ role: 'system', content: msg.content })
    } else if (msg.role === 'user') {
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          result.push({
            role: 'tool',
            content: tr.error ? `Error: ${tr.error}\n\n${tr.result}` : tr.result,
            tool_call_id: tr.toolCallId,
          })
        }
      } else {
        result.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'assistant') {
      const azureMsg: AzureMessage = { role: 'assistant', content: msg.content }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        azureMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }))
        if (!msg.content) {
          azureMsg.content = ''
        }
      }
      result.push(azureMsg)
    }
  }

  return result
}

function convertTools(tools: readonly ToolDefinition[]): AzureTool[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

function parseStreamingToolCalls(
  toolCalls: AzureStreamChoice['delta']['tool_calls'],
  accum: Map<number, { id: string; name: string; args: string }>,
): ToolCall[] {
  const result: ToolCall[] = []
  if (!toolCalls) return result

  for (const tc of toolCalls) {
    const idx = tc.index
    let entry = accum.get(idx)
    if (!entry) {
      entry = { id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? '', args: '' }
      accum.set(idx, entry)
    }
    if (tc.id) entry.id = tc.id
    if (tc.function?.name) entry.name = tc.function.name
    if (tc.function?.arguments) entry.args += tc.function.arguments
  }

  for (const [, entry] of accum) {
    if (entry.name && entry.args) {
      try {
        JSON.parse(entry.args)
        result.push({ id: entry.id, name: entry.name, args: JSON.parse(entry.args) })
      } catch {
        // incomplete, don't emit yet
      }
    }
  }
  return result
}

function extractFinalToolCalls(
  toolCalls: AzureStreamChoice['delta']['tool_calls'],
  accum: Map<number, { id: string; name: string; args: string }>,
): ToolCall[] {
  const result: ToolCall[] = []
  if (!toolCalls) return result

  for (const tc of toolCalls) {
    const idx = tc.index
    let entry = accum.get(idx)
    if (!entry) {
      entry = { id: tc.id ?? `call_${idx}`, name: tc.function?.name ?? '', args: '' }
      accum.set(idx, entry)
    }
    if (tc.id) entry.id = tc.id
    if (tc.function?.name) entry.name = tc.function.name
    if (tc.function?.arguments) entry.args += tc.function.arguments
  }

  for (const [, entry] of accum) {
    if (entry.name && entry.args) {
      try {
        result.push({ id: entry.id, name: entry.name, args: JSON.parse(entry.args) })
      } catch {
        // ignore malformed
      }
    }
  }
  return result
}

export function createAzureModel(azureConfig: AzureConfig): Model {
  const {
    provider = 'azure',
    name,
    apiKey,
    endpoint,
    apiVersion = '2024-02-15-preview',
    deploymentName,
    config,
  } = azureConfig

  const deployment = deploymentName ?? name

  return {
    id: `${provider}/${name}`,
    provider,
    name,
    config,

    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const messages = convertMessages(options.messages, options.system)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        messages,
        max_tokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stream: false,
      }

      if (tools) body.tools = tools
      if (options.tools && options.tools.length > 0) body.tool_choice = 'auto'

      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Azure OpenAI error: ${resp.status} ${resp.statusText} - ${errorText}`)
      }

      const data = (await resp.json()) as AzureResponse
      const choice = data.choices[0]
      const message = choice.message

      let content = ''
      if (typeof message.content === 'string') {
        content = message.content
      }

      const toolCalls: ToolCall[] = message.tool_calls
        ? message.tool_calls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          }))
        : []

      const usage: TokenUsage = {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
        total: data.usage.total_tokens,
      }

      return {
        content,
        toolCalls,
        usage,
        finishReason: mapFinishReason(choice.finish_reason),
        model: name,
        provider,
      }
    },

    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const messages = convertMessages(options.messages, options.system)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        messages,
        max_tokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }

      if (tools) body.tools = tools
      if (options.tools && options.tools.length > 0) body.tool_choice = 'auto'

      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Azure OpenAI error: ${resp.status} ${resp.statusText} - ${errorText}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')

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
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue

            try {
              const parsed = JSON.parse(dataStr) as AzureStreamResponse
              const choice = parsed.choices[0]

              if (parsed.usage) {
                yield {
                  type: 'usage',
                  usage: {
                    input: parsed.usage.prompt_tokens,
                    output: parsed.usage.completion_tokens,
                    total: parsed.usage.total_tokens,
                  },
                }
              }

              if (!choice) continue

              const deltas = parseStreamingToolCalls(choice.delta.tool_calls, toolCallAccum)
              for (const tc of deltas) {
                yield { type: 'tool-call', toolCall: tc }
              }

              if (choice.delta.content) {
                yield { type: 'text-delta', delta: choice.delta.content }
              }

              if (choice.finish_reason) {
                const finalToolCalls = extractFinalToolCalls(choice.delta.tool_calls, toolCallAccum)
                for (const tc of finalToolCalls) {
                  yield { type: 'tool-call', toolCall: tc }
                }
                yield { type: 'finish', reason: mapFinishReason(choice.finish_reason) }
              }
            } catch {
              // ignore malformed JSON
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    },

    supportsFeature(feature: keyof ModelCapabilities): boolean {
      return !!config.capabilities[feature]
    },

    getCapabilities(): ModelCapabilities {
      return config.capabilities
    },
  }
}
