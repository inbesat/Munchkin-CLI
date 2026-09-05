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

export interface GoogleConfig {
  readonly provider?: string
  readonly name: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly config: ModelConfig
}

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  thought?: boolean
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiPart[] }
  tools?: Array<{
    functionDeclarations: Array<{
      name: string
      description: string
      parameters: Record<string, unknown>
    }>
  }>
  generationConfig?: {
    maxOutputTokens?: number
    temperature?: number
    thinkingConfig?: { thinkingBudget?: number }
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: GeminiPart[] }
    finishReason: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content: { parts: GeminiPart[] }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export function convertContents(
  messages: readonly import('../../model/types').ModelMessage[],
  system?: string,
): { contents: GeminiContent[]; systemInstruction?: { parts: GeminiPart[] } } {
  const contents: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') continue

    if (msg.role === 'user') {
      const parts: GeminiPart[] = []
      if (msg.content) {
        parts.push({ text: msg.content })
      }
      if (msg.toolResults && msg.toolResults.length > 0) {
        for (const tr of msg.toolResults) {
          parts.push({
            functionResponse: {
              name: tr.toolName,
              response: tr.error ? { error: tr.error, result: tr.result } : { result: tr.result },
            },
          })
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'user', parts })
      }
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = []
      if (msg.content) {
        parts.push({ text: msg.content })
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.args } })
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts })
      }
      if (msg.toolResults && msg.toolResults.length > 0) {
        const resultParts: GeminiPart[] = []
        for (const tr of msg.toolResults) {
          resultParts.push({
            functionResponse: {
              name: tr.toolName,
              response: tr.error ? { error: tr.error, result: tr.result } : { result: tr.result },
            },
          })
        }
        if (resultParts.length > 0) {
          contents.push({ role: 'user', parts: resultParts })
        }
      }
    }
  }

  const result: { contents: GeminiContent[]; systemInstruction?: { parts: GeminiPart[] } } = {
    contents,
  }
  if (system) {
    result.systemInstruction = { parts: [{ text: system }] }
  }
  return result
}

export function convertTools(tools: readonly import('../../model/types').ToolDefinition[]):
  | Array<{
      functionDeclarations: Array<{
        name: string
        description: string
        parameters: Record<string, unknown>
      }>
    }>
  | undefined {
  if (tools.length === 0) return undefined
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ]
}

function mapFinishReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop'
    case 'MAX_TOKENS':
      return 'length'
    case 'SAFETY':
    case 'OTHER':
      return 'error'
    default:
      return 'stop'
  }
}

function mapUsage(usage: GeminiResponse['usageMetadata'] | undefined): TokenUsage {
  if (!usage) {
    return { input: 0, output: 0, total: 0 }
  }
  return {
    input: usage.promptTokenCount,
    output: usage.candidatesTokenCount,
    total: usage.totalTokenCount,
  }
}

let toolCallCounter = 0
function nextToolCallId(): string {
  return `google-call-${++toolCallCounter}`
}

function extractParts(parts: GeminiPart[]): {
  text: string
  thinking: string
  toolCalls: ToolCall[]
} {
  let text = ''
  let thinking = ''
  const toolCalls: ToolCall[] = []

  for (const part of parts) {
    if (part.thought) {
      if (part.text) thinking += part.text
    } else if (part.text) {
      text += part.text
    } else if (part.functionCall) {
      toolCalls.push({
        id: nextToolCallId(),
        name: part.functionCall.name,
        args: part.functionCall.args,
      })
    }
  }

  return { text, thinking, toolCalls }
}

function buildUrl(modelName: string, method: string, apiKey: string, baseUrl: string): string {
  return `${baseUrl}/models/${modelName}:${method}?key=${apiKey}`
}

function buildGenerationConfig(
  options: GenerateOptions,
  config: ModelConfig,
): NonNullable<GeminiRequest['generationConfig']> {
  const genConfig: NonNullable<GeminiRequest['generationConfig']> = {}
  const maxTokens = options.maxTokens ?? config.defaultMaxTokens
  if (maxTokens !== undefined) {
    genConfig.maxOutputTokens = maxTokens
  }
  if (options.temperature !== undefined) {
    genConfig.temperature = options.temperature
  }
  if (options.thinking !== undefined && options.thinking !== false) {
    const budget = typeof options.thinking === 'object' ? options.thinking.budgetTokens : undefined
    genConfig.thinkingConfig = { thinkingBudget: budget }
  }
  return genConfig
}

export function parseSSELine(line: string): GeminiStreamChunk | null {
  if (!line.startsWith('data: ')) return null
  const data = line.slice(6)
  if (data === '[DONE]') return null
  try {
    return JSON.parse(data) as GeminiStreamChunk
  } catch {
    return null
  }
}

export function createGoogleModel(googleConfig: GoogleConfig): Model {
  const provider = googleConfig.provider ?? 'google'
  const { apiKey, config } = googleConfig
  const baseUrl = googleConfig.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'

  async function doGenerate(options: GenerateOptions): Promise<GenerateResult> {
    const { contents, systemInstruction } = convertContents(options.messages, options.system)
    const body: GeminiRequest = { contents }
    if (systemInstruction) body.systemInstruction = systemInstruction

    const tools = convertTools(options.tools ?? [])
    if (tools) body.tools = tools

    const genConfig = buildGenerationConfig(options, config)
    if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig

    const url = buildUrl(config.name, 'generateContent', apiKey, baseUrl)
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`Google Gemini API error ${resp.status}: ${errBody}`)
    }

    const data = (await resp.json()) as GeminiResponse
    const candidate = data.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const extracted = extractParts(parts)

    return {
      content: extracted.text,
      toolCalls: extracted.toolCalls,
      thinking: extracted.thinking || undefined,
      usage: mapUsage(data.usageMetadata),
      finishReason: mapFinishReason(candidate?.finishReason),
      model: config.name,
      provider,
    }
  }

  async function* doStream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const { contents, systemInstruction } = convertContents(options.messages, options.system)
    const body: GeminiRequest = { contents }
    if (systemInstruction) body.systemInstruction = systemInstruction

    const tools = convertTools(options.tools ?? [])
    if (tools) body.tools = tools

    const genConfig = buildGenerationConfig(options, config)
    if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig

    const url = `${buildUrl(config.name, 'streamGenerateContent', apiKey, baseUrl)}&alt=sse`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    })

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown error')
      throw new Error(`Google Gemini API error ${resp.status}: ${errBody}`)
    }

    if (!resp.body) {
      throw new Error('No response body for streaming')
    }

    const reader = resp.body.getReader()
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

          const chunk = parseSSELine(trimmed)
          if (!chunk) continue

          const candidate = chunk.candidates?.[0]
          if (!candidate) continue

          const parts = candidate.content?.parts ?? []
          for (const part of parts) {
            if (part.thought) {
              if (part.text) {
                yield { type: 'thinking-delta', delta: part.text }
              }
            } else if (part.text) {
              yield { type: 'text-delta', delta: part.text }
            } else if (part.functionCall) {
              const id = nextToolCallId()
              yield {
                type: 'tool-call',
                toolCall: {
                  id,
                  name: part.functionCall.name,
                  args: part.functionCall.args,
                },
              }
            }
          }

          if (candidate.finishReason) {
            if (chunk.usageMetadata) {
              yield { type: 'usage', usage: mapUsage(chunk.usageMetadata) }
            }
            yield { type: 'finish', reason: mapFinishReason(candidate.finishReason) }
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
