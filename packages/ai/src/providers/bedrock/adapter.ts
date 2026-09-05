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

export interface BedrockConfig {
  provider?: string
  name: string
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  model?: string
  config: ModelConfig
}

interface BedrockMessage {
  role: 'user' | 'assistant'
  content: BedrockContentBlock[]
}

type BedrockContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content?: string; is_error?: boolean }

interface BedrockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface BedrockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content?: string
  is_error?: boolean
}

function mapFinishReason(stopReason: string): FinishReason {
  switch (stopReason) {
    case 'end_turn':
      return 'stop'
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

function convertMessages(
  messages: readonly ModelMessage[],
  system?: string,
): { system?: string; messages: BedrockMessage[] } {
  const bedrockMessages: BedrockMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
    } else if (msg.role === 'user') {
      if (msg.toolResults && msg.toolResults.length > 0) {
        const content: Array<BedrockToolResult> = msg.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.toolCallId,
          content: tr.error ? `Error: ${tr.error}\n\n${tr.result}` : tr.result,
          is_error: !!tr.error,
        }))
        bedrockMessages.push({ role: 'user', content })
      } else {
        bedrockMessages.push({ role: 'user', content: [{ type: 'text', text: msg.content }] })
      }
    } else if (msg.role === 'assistant') {
      const content: Array<{ type: 'text'; text: string } | BedrockToolUse> = []
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
      bedrockMessages.push({ role: 'assistant', content })
    }
  }

  return { system, messages: bedrockMessages }
}

function convertTools(
  tools: readonly ToolDefinition[],
): { name: string; description: string; input_schema: Record<string, unknown> }[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

function getAuthHeaders(config: BedrockConfig, region: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Amz-Target': 'Converse',
    'X-Amz-Region-Id': region,
  }

  if (config.accessKeyId) {
    headers['X-Amz-Access-Key'] = config.accessKeyId
  }
  if (config.secretAccessKey) {
    headers['X-Amz-Secret-Key'] = config.secretAccessKey
  }
  if (config.sessionToken) {
    headers['X-Amz-Security-Token'] = config.sessionToken
  }

  return headers
}

function getStreamAuthHeaders(config: BedrockConfig, region: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Amz-Target': 'ConverseStream',
    'X-Amz-Region-Id': region,
  }

  if (config.accessKeyId) {
    headers['X-Amz-Access-Key'] = config.accessKeyId
  }
  if (config.secretAccessKey) {
    headers['X-Amz-Secret-Key'] = config.secretAccessKey
  }
  if (config.sessionToken) {
    headers['X-Amz-Security-Token'] = config.sessionToken
  }

  return headers
}

export function createBedrockModel(bedrockConfig: BedrockConfig): Model {
  const { provider = 'bedrock', name, region = 'us-east-1', model, config } = bedrockConfig

  const modelId = model ?? name

  return {
    id: `${provider}/${name}`,
    provider,
    name,
    config,

    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const { system, messages } = convertMessages(options.messages, options.system)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        modelId,
        messages,
        inferenceConfig: {
          maxTokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
        },
      }

      if (system) {
        body.system = [{ text: system }]
      }

      if (tools) {
        body.tools = tools.map((t) => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: t.input_schema,
          },
        }))
      }

      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`

      const resp = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(bedrockConfig, region),
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Bedrock API error: ${resp.status} ${resp.statusText} - ${errorText}`)
      }

      const data = (await resp.json()) as {
        output: {
          message: {
            role: string
            content: Array<{
              text?: string
              toolUse?: { id: string; name: string; input: Record<string, unknown> }
            }>
          }
        }
        stopReason: string
        usage: { inputTokens: number; outputTokens: number }
      }

      let content = ''
      const toolCalls: ToolCall[] = []

      for (const block of data.output.message.content) {
        if (block.text) {
          content += block.text
        } else if (block.toolUse) {
          toolCalls.push({
            id: block.toolUse.id,
            name: block.toolUse.name,
            args: block.toolUse.input,
          })
        }
      }

      const usage: TokenUsage = {
        input: data.usage.inputTokens,
        output: data.usage.outputTokens,
        total: data.usage.inputTokens + data.usage.outputTokens,
      }

      return {
        content,
        toolCalls,
        usage,
        finishReason: mapFinishReason(data.stopReason),
        model: name,
        provider,
      }
    },

    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const { system, messages } = convertMessages(options.messages, options.system)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        modelId,
        messages,
        inferenceConfig: {
          maxTokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
        },
      }

      if (system) {
        body.system = [{ text: system }]
      }

      if (tools) {
        body.tools = tools.map((t) => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: t.input_schema,
          },
        }))
      }

      const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke-with-response-stream`

      const resp = await fetch(url, {
        method: 'POST',
        headers: getStreamAuthHeaders(bedrockConfig, region),
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Bedrock API error: ${resp.status} ${resp.statusText} - ${errorText}`)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

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

            try {
              const parsed = JSON.parse(trimmed) as { bytes: string }

              const eventJson = atob(parsed.bytes)
              const event = JSON.parse(eventJson) as {
                messageStop?: { stopReason: string }
                contentBlockStart?: {
                  contentBlockIndex: number
                  start: { text?: string; toolUse?: { id: string; name: string } }
                }
                contentBlockDelta?: {
                  contentBlockIndex: number
                  delta: { text?: string; toolUse?: { input: string } }
                }
                contentBlockStop?: { contentBlockIndex: number }
                messageStart?: { role: string }
                metadata?: { usage: { inputTokens: number; outputTokens: number } }
              }

              if (event.messageStart) {
                continue
              }

              if (event.contentBlockStart?.start?.text) {
                continue
              }

              if (event.contentBlockStart?.start?.toolUse) {
                continue
              }

              if (event.contentBlockDelta?.delta?.text) {
                yield { type: 'text-delta', delta: event.contentBlockDelta.delta.text }
              }

              if (event.contentBlockDelta?.delta?.toolUse) {
                try {
                  const input = JSON.parse(event.contentBlockDelta.delta.toolUse.input)
                  yield {
                    type: 'tool-call',
                    toolCall: {
                      id: `call_${Date.now()}`,
                      name: '',
                      args: input,
                    },
                  }
                } catch {
                  // incomplete JSON
                }
              }

              if (event.metadata?.usage) {
                yield {
                  type: 'usage',
                  usage: {
                    input: event.metadata.usage.inputTokens,
                    output: event.metadata.usage.outputTokens,
                    total: event.metadata.usage.inputTokens + event.metadata.usage.outputTokens,
                  },
                }
              }

              if (event.messageStop) {
                yield { type: 'finish', reason: mapFinishReason(event.messageStop.stopReason) }
                return
              }
            } catch {
              // ignore malformed events
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
