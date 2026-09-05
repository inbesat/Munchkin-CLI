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

export interface VertexConfig {
  provider?: string
  name: string
  projectId?: string
  location?: string
  accessToken?: string
  model?: string
  config: ModelConfig
}

interface VertexMessage {
  role: 'user' | 'model'
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: { result: unknown } } }
  >
}

interface VertexTool {
  functionDeclarations: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}

function mapFinishReason(finishReason: string): FinishReason {
  switch (finishReason) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
      return 'error'
    case 'RECITATION':
      return 'error'
    default:
      return 'stop'
  }
}

function convertMessages(messages: readonly ModelMessage[]): VertexMessage[] {
  const result: VertexMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
    } else if (msg.role === 'user') {
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          result.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: tr.toolCallId,
                  response: { result: tr.error ? `Error: ${tr.error}\n\n${tr.result}` : tr.result },
                },
              },
            ],
          })
        }
      } else {
        result.push({ role: 'user', parts: [{ text: msg.content }] })
      }
    } else if (msg.role === 'assistant') {
      const parts: VertexMessage['parts'] = []
      if (msg.content) {
        parts.push({ text: msg.content })
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.args,
            },
          })
        }
      }
      result.push({ role: 'model', parts })
    }
  }

  return result
}

function convertTools(tools: readonly ToolDefinition[]): VertexTool | undefined {
  if (tools.length === 0) return undefined
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }
}

export function createVertexModel(vertexConfig: VertexConfig): Model {
  const {
    provider = 'vertex',
    name,
    projectId,
    location = 'us-central1',
    accessToken,
    model,
    config,
  } = vertexConfig

  const modelId = model ?? name

  return {
    id: `${provider}/${name}`,
    provider,
    name,
    config,

    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const contents = convertMessages(options.messages)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
        },
      }

      if (options.system) {
        body.systemInstruction = { parts: [{ text: options.system }] }
      }

      if (tools) {
        body.tools = [tools]
      }

      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Vertex AI error: ${resp.status} ${resp.statusText} - ${errorText}`)
      }

      const data = (await resp.json()) as {
        candidates: Array<{
          content: {
            role: string
            parts: Array<{
              text?: string
              functionCall?: { name: string; args: Record<string, unknown> }
            }>
          }
          finishReason: string
        }>
        usageMetadata: {
          promptTokenCount: number
          candidatesTokenCount: number
          totalTokenCount: number
        }
      }

      const candidate = data.candidates[0]
      let content = ''
      const toolCalls: ToolCall[] = []

      for (const part of candidate.content.parts) {
        if (part.text) {
          content += part.text
        } else if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            name: part.functionCall.name,
            args: part.functionCall.args,
          })
        }
      }

      const usage: TokenUsage = {
        input: data.usageMetadata.promptTokenCount,
        output: data.usageMetadata.candidatesTokenCount,
        total: data.usageMetadata.totalTokenCount,
      }

      return {
        content,
        toolCalls,
        usage,
        finishReason: mapFinishReason(candidate.finishReason),
        model: name,
        provider,
      }
    },

    async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const contents = convertMessages(options.messages)
      const tools = convertTools(options.tools ?? [])

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? config.defaultMaxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
        },
      }

      if (options.system) {
        body.systemInstruction = { parts: [{ text: options.system }] }
      }

      if (tools) {
        body.tools = [tools]
      }

      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:streamGenerateContent?alt=sse`

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      })

      if (!resp.ok) {
        const errorText = await resp.text()
        throw new Error(`Vertex AI error: ${resp.status} ${resp.statusText} - ${errorText}`)
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
            if (!trimmed || !trimmed.startsWith('data: ')) continue

            const dataStr = trimmed.slice(6)
            if (dataStr === '[DONE]') continue

            try {
              const parsed = JSON.parse(dataStr) as {
                candidates?: Array<{
                  content: {
                    role: string
                    parts: Array<{
                      text?: string
                      functionCall?: { name: string; args: Record<string, unknown> }
                    }>
                  }
                  finishReason?: string
                }>
                usageMetadata?: {
                  promptTokenCount: number
                  candidatesTokenCount: number
                  totalTokenCount: number
                }
              }

              if (parsed.usageMetadata) {
                yield {
                  type: 'usage',
                  usage: {
                    input: parsed.usageMetadata.promptTokenCount,
                    output: parsed.usageMetadata.candidatesTokenCount,
                    total: parsed.usageMetadata.totalTokenCount,
                  },
                }
              }

              if (!parsed.candidates || parsed.candidates.length === 0) continue
              const candidate = parsed.candidates[0]

              for (const part of candidate.content.parts) {
                if (part.text) {
                  yield { type: 'text-delta', delta: part.text }
                } else if (part.functionCall) {
                  yield {
                    type: 'tool-call',
                    toolCall: {
                      id: `call_${Date.now()}`,
                      name: part.functionCall.name,
                      args: part.functionCall.args,
                    },
                  }
                }
              }

              if (candidate.finishReason) {
                yield { type: 'finish', reason: mapFinishReason(candidate.finishReason) }
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
