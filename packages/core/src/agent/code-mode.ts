import type { AgentModel, AgentTool } from './types'

/** Configuration for code mode execution. */
export interface CodeModeOptions {
  /** The model to use for generating the program. */
  model: AgentModel
  /** Available tools to include in the SDK. */
  tools: readonly AgentTool[]
  /** System prompt for the code generation. */
  system?: string
  /** Maximum execution time for the generated program (ms). */
  timeout?: number
  /** Whether to include type definitions in the SDK. */
  includeTypes?: boolean
}

/** Result of code mode execution. */
export interface CodeModeResult {
  /** The generated program source code. */
  program: string
  /** Execution result from running the program. */
  execution: {
    success: boolean
    output?: unknown
    error?: string
    durationMs: number
  }
  /** Parsed tool calls from the program execution. */
  toolCalls: CodeModeToolCall[]
}

/** A tool call recorded during code mode execution. */
export interface CodeModeToolCall {
  name: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  durationMs: number
}

/** Generate TypeScript SDK source code for the given tools. */
export function generateSDK(tools: readonly AgentTool[], includeTypes = true): string {
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ?? { type: 'object', properties: {} },
  }))

  let sdk = `// Auto-generated tool SDK for code mode
// Tools: ${tools.map((t) => t.name).join(', ')}

`

  if (includeTypes) {
    sdk += `// Type definitions
export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}

`

    // Generate Zod-like schema types for each tool
    for (const tool of toolDefs) {
      const argsType = generateArgsType(tool.parameters)
      sdk += `export interface ${capitalize(tool.name)}Args ${argsType}
`
    }
    sdk += '\n'
  }

  // Tool implementations
  sdk += `// Tool implementations
const toolRegistry = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()

`

  for (const tool of toolDefs) {
    const fnName = `execute${capitalize(tool.name)}`
    sdk += `async function ${fnName}(args: ${capitalize(tool.name)}Args): Promise<unknown> {
  // This will be replaced by the actual tool execution at runtime
  return toolRegistry.get('${tool.name}')?.(args)
}

`
  }

  // Main execution function
  sdk += `// Main execution entry point
export async function main(): Promise<unknown> {
  // User code goes here - this will be replaced by the model-generated program
  throw new Error('main() not implemented - this should be replaced by the model')
}

export { toolRegistry }
`

  return sdk
}

/** Generate TypeScript type from JSON Schema (simplified). */
function generateArgsType(schema: Record<string, unknown>): string {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined
  const required = (schema.required as string[]) ?? []
  if (!props) return '= {}'

  const fields = Object.entries(props).map(([key, prop]) => {
    const optional = !required.includes(key)
    const tsType = jsonSchemaToTS(prop)
    return `${key}${optional ? '?' : ''}: ${tsType}`
  })

  return `{ ${fields.join('; ')} }`
}

/** Convert JSON Schema type to TypeScript type (simplified). */
function jsonSchemaToTS(schema: Record<string, unknown>): string {
  const type = schema.type as string | undefined
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return `Array<${jsonSchemaToTS(schema.items as Record<string, unknown>)}>`
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/** Execute code mode: generate SDK, have model write program, execute it. */
export async function executeCodeMode(
  userPrompt: string,
  options: CodeModeOptions,
): Promise<CodeModeResult> {
  const { model, tools, system, timeout = 60_000, includeTypes = true } = options

  // Generate SDK
  const sdk = generateSDK(tools, includeTypes)

  // Build the code generation prompt
  const prompt = buildCodeGenerationPrompt(userPrompt, tools, sdk)

  // Have model generate the program
  const program = await generateProgram(model, system, prompt)

  // Inject the actual tool implementations
  const fullProgram = injectToolImplementations(sdk, program, tools)

  // Execute the program
  const execution = await executeProgram(fullProgram, timeout)

  // Extract tool calls from execution
  const toolCalls = extractToolCalls(execution)

  return {
    program: fullProgram,
    execution,
    toolCalls,
  }
}

/** Build the prompt for code generation. */
function buildCodeGenerationPrompt(
  userPrompt: string,
  tools: readonly AgentTool[],
  sdk: string,
): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')

  return `You are a programming agent. Write a TypeScript program that uses the provided SDK to accomplish the user's task.

USER TASK:
${userPrompt}

AVAILABLE TOOLS:
${toolList}

SDK:
\`\`\`typescript
${sdk}
\`\`\`

Write a complete program that replaces the \`main()\` function. The program should:
1. Use the tool functions (e.g., \`executeReadFile\`, \`executeGrep\`, etc.)
2. Handle errors appropriately with try/catch
3. Return the final result
4. Be self-contained and executable

Return ONLY the TypeScript code for the \`main()\` function, no markdown formatting.
`
}

/** Generate program using the model. */
async function generateProgram(
  model: AgentModel,
  system: string | undefined,
  prompt: string,
): Promise<string> {
  let program = ''

  for await (const chunk of model.stream({
    messages: [{ role: 'user', content: prompt }],
    system,
    maxTokens: 4096,
    temperature: 0.1,
  })) {
    if (chunk.type === 'text-delta') {
      program += chunk.delta
    } else if (chunk.type === 'finish') {
      break
    }
  }

  // Clean up the response - extract just the main function
  return cleanProgram(program)
}

/** Clean the model's output to extract the main function. */
function cleanProgram(raw: string): string {
  // Remove markdown code fences if present
  const cleaned = raw
    .replace(/^```typescript\s*/, '')
    .replace(/```$/, '')
    .trim()

  // If it contains a main function, extract it (match up to closing brace)
  const mainMatch = cleaned.match(/async function main\(\)\s*\{[\s\S]*?\}/)
  if (mainMatch) {
    return mainMatch[0]
  }

  // If it's just the function body, wrap it
  if (!cleaned.includes('function main') && !cleaned.includes('async function main')) {
    return `async function main() {\n${cleaned}\n}`
  }

  return cleaned
}

/** Inject actual tool implementations into the SDK. */
function injectToolImplementations(
  sdk: string,
  program: string,
  tools: readonly AgentTool[],
): string {
  // Build the tool registry initialization
  const registryInit = tools
    .map((t) => `toolRegistry.set('${t.name}', async (args) => ${t.name}Impl(args))`)
    .join('\n  ')

  // Replace the toolRegistry initialization and main function
  let full = sdk
  full = full.replace(
    '// Tool implementations\nconst toolRegistry = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()\n',
    `// Tool implementations\nconst toolRegistry = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()\n  ${registryInit}\n\n`,
  )

  // Replace the tool function stubs with actual implementations
  for (const tool of tools) {
    const fnName = `execute${capitalize(tool.name)}`
    const impl = `async function ${fnName}(args: any) {
  const impl = toolRegistry.get('${tool.name}')
  if (!impl) throw new Error('Tool not registered: ${tool.name}')
  return impl(args)
}`
    full = full.replace(
      new RegExp(`async function ${fnName}\\(args: [^)]+\\)\\s*\\{[\\s\\S]*?\\n\\}`),
      impl,
    )
  }

  // Replace the main function
  full = full.replace(/async function main\(\) \{[\s\S]*?\n\}/, program)

  return full
}

/** Execute the TypeScript program. */
async function executeProgram(
  program: string,
  timeout: number,
): Promise<{ success: boolean; output?: unknown; error?: string; durationMs: number }> {
  const start = Date.now()

  try {
    // For now, we'll use a simple eval approach
    // In production, this would use a proper sandbox (vm2, isolated-vm, etc.)
    const toolRegistry = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()

    // Create a function that has access to toolRegistry
    const fn = new Function(
      'toolRegistry',
      `
${program}
return main()
`,
    )

    const result = await Promise.race([
      fn(toolRegistry),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout')), timeout)),
    ])

    return {
      success: true,
      output: result,
      durationMs: Date.now() - start,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    }
  }
}

/** Extract tool calls from execution result. */
function extractToolCalls(_execution: { success: boolean; output?: unknown }): CodeModeToolCall[] {
  // For now, return empty - in a real implementation, this would parse the execution log
  return []
}

export { buildCodeGenerationPrompt, cleanProgram, capitalize, jsonSchemaToTS, generateArgsType }
