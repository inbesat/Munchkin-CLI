/** Redaction configuration. */
export interface RedactionConfig {
  /** Custom patterns to redact. */
  customPatterns?: RedactionPattern[]
  /** Whether to redact environment variable values. Default: true. */
  redactEnvVars?: boolean
  /** Environment variable names that should be redacted (case-insensitive). */
  secretEnvVars?: string[]
  /** Replacement string. Default: '[REDACTED]'. */
  replacement?: string
  /** Whether to preserve length of redacted text. Default: false. */
  preserveLength?: boolean
}

/** A pattern for detecting secrets. */
export interface RedactionPattern {
  /** Unique identifier. */
  id: string
  /** Regex pattern to match. */
  pattern: RegExp
  /** Description of what this pattern catches. */
  description: string
  /** Whether this pattern is enabled. Default: true. */
  enabled?: boolean
}

/** Result of redaction. */
export interface RedactionResult {
  /** The redacted text. */
  text: string
  /** Number of redactions performed. */
  count: number
  /** Details of what was redacted. */
  matches: RedactionMatch[]
}

/** A single redaction match. */
export interface RedactionMatch {
  /** The pattern ID that matched. */
  patternId: string
  /** The matched text (before redaction). */
  matched: string
  /** Start position in original text. */
  start: number
  /** End position in original text. */
  end: number
}

/** Default secret environment variable names. */
const DEFAULT_SECRET_ENV_VARS = [
  'api_key',
  'apikey',
  'api_key',
  'access_token',
  'accesstoken',
  'secret_key',
  'secretkey',
  'private_key',
  'privatekey',
  'password',
  'passwd',
  'pwd',
  'token',
  'auth_token',
  'authtoken',
  'bearer_token',
  'bearertoken',
  'jwt',
  'api_secret',
  'apisecret',
  'client_secret',
  'clientsecret',
  'signing_key',
  'signingkey',
  'encryption_key',
  'encryptionkey',
  'webhook_secret',
  'webhooksecret',
  'database_url',
  'databaseurl',
  'connection_string',
  'connectionstring',
  'redis_url',
  'redisurl',
  'mongodb_uri',
  'mongodburi',
  'postgres_url',
  'postgresurl',
  'mysql_url',
  'mysqlurl',
]

/** Default patterns for common secret formats. */
const DEFAULT_PATTERNS: RedactionPattern[] = [
  // Anthropic API keys
  {
    id: 'anthropic-api-key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{95}/g,
    description: 'Anthropic API key',
  },
  // OpenAI API keys
  {
    id: 'openai-api-key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    description: 'OpenAI API key',
  },
  // GitHub tokens
  {
    id: 'github-token',
    pattern: /gh[pousr]_[a-zA-Z0-9_]{36,}/g,
    description: 'GitHub token (classic, fine-grained, OAuth, etc.)',
  },
  // GitLab tokens
  {
    id: 'gitlab-token',
    pattern: /glpat-[a-zA-Z0-9_-]{20,}/g,
    description: 'GitLab personal access token',
  },
  // AWS keys
  {
    id: 'aws-access-key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    description: 'AWS access key ID',
  },
  {
    id: 'aws-secret-key',
    pattern: /[a-zA-Z0-9/+=]{40}/g,
    description: 'AWS secret access key (heuristic)',
  },
  // Google Cloud
  {
    id: 'gcp-api-key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    description: 'Google Cloud API key',
  },
  // Slack tokens
  {
    id: 'slack-token',
    pattern: /xox[baprs]-[0-9a-zA-Z]{10,}/g,
    description: 'Slack bot/user/app token',
  },
  // Discord tokens
  {
    id: 'discord-token',
    pattern: /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/g,
    description: 'Discord bot token',
  },
  // Stripe keys
  {
    id: 'stripe-secret-key',
    pattern: /sk_live_[0-9a-zA-Z]{24,}/g,
    description: 'Stripe secret key (live)',
  },
  {
    id: 'stripe-test-key',
    pattern: /sk_test_[0-9a-zA-Z]{24,}/g,
    description: 'Stripe secret key (test)',
  },
  {
    id: 'stripe-publishable-key',
    pattern: /pk_live_[0-9a-zA-Z]{24,}/g,
    description: 'Stripe publishable key (live)',
  },
  {
    id: 'stripe-test-publishable-key',
    pattern: /pk_test_[0-9a-zA-Z]{24,}/g,
    description: 'Stripe publishable key (test)',
  },
  // Generic bearer tokens
  {
    id: 'bearer-token',
    pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,
    description: 'Bearer token in Authorization header',
  },
  // Generic API key patterns
  {
    id: 'generic-api-key',
    pattern: /['"]([a-zA-Z0-9_-]{32,})['"]/g,
    description: 'Quoted string that looks like an API key',
  },
  // Private keys (PEM format)
  {
    id: 'private-key-pem',
    pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA )?PRIVATE KEY-----/g,
    description: 'PEM-format private key',
  },
  // SSH private keys
  {
    id: 'ssh-private-key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    description: 'OpenSSH private key',
  },
  // JWT tokens
  {
    id: 'jwt-token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    description: 'JWT token',
  },
  // Database URLs with credentials
  {
    id: 'database-url',
    pattern: /(postgres|mysql|mongodb|redis):\/\/[^:\/\s]+:[^@\/\s]+@[^:\/\s]+/gi,
    description: 'Database URL with credentials',
  },
  // Generic key=value patterns for common secret names
  {
    id: 'key-value-secret',
    pattern: /(api[_-]?key|access[_-]?token|secret[_-]?key|password|passwd|token|auth[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9._-]{16,})['"]?/gi,
    description: 'Key-value pair with secret-like name and value',
  },
]

/** Create default redaction config. */
export function createRedactionConfig(overrides: Partial<RedactionConfig> = {}): RedactionConfig {
  return {
    customPatterns: [],
    redactEnvVars: true,
    secretEnvVars: DEFAULT_SECRET_ENV_VARS,
    replacement: '[REDACTED]',
    preserveLength: false,
    ...overrides,
  }
}

/** Redact secrets from text. */
export function redact(text: string, config: RedactionConfig = createRedactionConfig()): RedactionResult {
  const {
    customPatterns = [],
    redactEnvVars = true,
    secretEnvVars = DEFAULT_SECRET_ENV_VARS,
    replacement = '[REDACTED]',
    preserveLength = false,
  } = config

  const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns].filter((p) => p.enabled !== false)
  const matches: RedactionMatch[] = []
  let result = text

  // Track replacements to adjust positions
  let offset = 0

  for (const patternDef of allPatterns) {
    const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags)
    let match

    while ((match = regex.exec(text)) !== null) {
      const matchedText = match[0]
      const start = match.index + offset
      const end = start + matchedText.length

      // Skip if already redacted (overlapping)
      const alreadyRedacted = matches.some(
        (m) => m.start < end && m.end > start,
      )
      if (alreadyRedacted) {
        // Prevent infinite loops on zero-width matches
        if (regex.lastIndex === match.index) {
          regex.lastIndex++
        }
        continue
      }

      const replacementText = preserveLength
        ? replacement.padEnd(matchedText.length, 'X').slice(0, matchedText.length)
        : replacement

      // Replace in result
      result = result.slice(0, start) + replacementText + result.slice(end)
      offset += replacementText.length - matchedText.length

      matches.push({
        patternId: patternDef.id,
        matched: matchedText,
        start: match.index,
        end: match.index + matchedText.length,
      })

      // Prevent infinite loops
      if (regex.lastIndex === match.index) {
        regex.lastIndex++
      }
    }
  }

  // Redact environment variable patterns
  if (redactEnvVars) {
    for (const envVar of secretEnvVars) {
      // Match patterns like: export SECRET_KEY=value, SECRET_KEY=value, SECRET_KEY="value"
      const envRegex = new RegExp(
        `\\b${envVar}\\s*[:=]\\s*['"]?([^'"\\s]{8,})['"]?`,
        'gi',
      )
      let match

      while ((match = envRegex.exec(text)) !== null) {
        const fullMatch = match[0]
        const secretValue = match[1]
        const start = match.index + offset
        const end = start + fullMatch.length

        const alreadyRedacted = matches.some(
          (m) => m.start < end && m.end > start,
        )
        if (alreadyRedacted) {
          if (envRegex.lastIndex === match.index) {
            envRegex.lastIndex++
          }
          continue
        }

        // Replace just the secret value part
        const beforeSecret = fullMatch.indexOf(secretValue)
        const replacementText = preserveLength
          ? replacement.padEnd(secretValue.length, 'X').slice(0, secretValue.length)
          : replacement

        const newFullMatch =
          fullMatch.slice(0, beforeSecret) + replacementText + fullMatch.slice(beforeSecret + secretValue.length)

        result = result.slice(0, start) + newFullMatch + result.slice(end)
        offset += newFullMatch.length - fullMatch.length

        matches.push({
          patternId: `env-${envVar}`,
          matched: secretValue,
          start: match.index,
          end: match.index + fullMatch.length,
        })

        if (envRegex.lastIndex === match.index) {
          envRegex.lastIndex++
        }
      }
    }
  }

  return {
    text: result,
    count: matches.length,
    matches,
  }
}

/** Redact multiple texts at once. */
export function redactAll(
  texts: string[],
  config: RedactionConfig = createRedactionConfig(),
): RedactionResult[] {
  return texts.map((t) => redact(t, config))
}

/** Redact an object's string values recursively. */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  config: RedactionConfig = createRedactionConfig(),
): T {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = redact(value, config).text
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        typeof v === 'string' ? redact(v, config).text : v,
      )
    } else if (value && typeof value === 'object') {
      result[key] = redactObject(value as Record<string, unknown>, config)
    } else {
      result[key] = value
    }
  }

  return result as T
}

/** Check if text contains potential secrets. */
export function hasSecrets(text: string, config: RedactionConfig = createRedactionConfig()): boolean {
  return redact(text, config).count > 0
}

/** Get all patterns (default + custom). */
export function getAllPatterns(config: RedactionConfig = createRedactionConfig()): RedactionPattern[] {
  return [...DEFAULT_PATTERNS, ...(config.customPatterns ?? [])].filter((p) => p.enabled !== false)
}

/** Add a custom pattern. */
export function addPattern(
  patterns: RedactionPattern[],
  newPattern: RedactionPattern,
): RedactionPattern[] {
  return [...patterns, newPattern]
}

/** Remove a pattern by ID. */
export function removePattern(patterns: RedactionPattern[], id: string): RedactionPattern[] {
  return patterns.filter((p) => p.id !== id)
}

/** Enable/disable a pattern. */
export function setPatternEnabled(
  patterns: RedactionPattern[],
  id: string,
  enabled: boolean,
): RedactionPattern[] {
  return patterns.map((p) => (p.id === id ? { ...p, enabled } : p))
}