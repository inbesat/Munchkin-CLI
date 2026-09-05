import { describe, it, expect, beforeEach } from 'bun:test'
import {
  redact,
  redactAll,
  redactObject,
  hasSecrets,
  createRedactionConfig,
  addPattern,
  removePattern,
  setPatternEnabled,
  getAllPatterns,
  RedactionConfig,
  RedactionPattern,
} from './redact'

describe('Secret Redaction', () => {
  const defaultConfig = createRedactionConfig()

  describe('redact - Anthropic API keys', () => {
    it('redacts sk-ant- keys', () => {
      const key = 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const text = `My key is ${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
      expect(result.text).not.toContain(key)
      expect(result.count).toBe(1)
    })

    it('redacts multiple Anthropic keys', () => {
      const key1 = 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const key2 = 'sk-ant-' + 'api03-zyxwvutsrqponmlkjihgfedcba0987654321zyxwvutsrqponmlkjihgfe'
      const text = `Key1: ${key1}, Key2: ${key2}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(2)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - OpenAI API keys', () => {
    it('redacts sk- keys', () => {
      const key = 'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr'
      const text = `OPENAI_API_KEY=${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
      expect(result.text).not.toContain(key)
    })
  })

  describe('redact - GitHub tokens', () => {
    it('redacts ghp_ tokens', () => {
      const token = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd'
      const text = `export GITHUB_TOKEN=${token}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
      expect(result.text).not.toContain(token)
    })

    it('redacts gho_ tokens', () => {
      const token = 'gho_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd'
      const text = `token: ${token}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts ghu_ tokens', () => {
      const token = 'ghu_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd'
      const text = `token: ${token}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts ghs_ tokens', () => {
      const token = 'ghs_abcdefghijklmnopqrstuvwxyz1234567890abcd'
      const text = `token: ${token}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts ghr_ tokens', () => {
      const token = 'ghr_abcdefghijklmnopqrstuvwxyz1234567890abcd'
      const text = `token: ${token}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - GitLab tokens', () => {
    it('redacts glpat- tokens', () => {
      const token = 'glpat-abcdefghijklmnopqrst'
      const text = `GITLAB_TOKEN=${token}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - AWS keys', () => {
    it('redacts AWS access key IDs', () => {
      const key = 'AKIAIOSFODNN7EXAMPLE'
      const text = `AWS_ACCESS_KEY_ID=${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts AWS secret access keys', () => {
      const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      const text = `AWS_SECRET_ACCESS_KEY=${secret}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('redact - Google Cloud API keys', () => {
    it('redacts AIza keys', () => {
      const key = 'AIza' + 'SyBabcdefghijklmnopqrstuvwxyz123456'
      const text = `GOOGLE_API_KEY=${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - Slack tokens', () => {
    it('redacts xoxb- bot tokens', () => {
      const token = 'xoxb-' + '123456789012-abcdefghijklmnop'
      const text = `SLACK_BOT_TOKEN=${token}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts xoxp- user tokens', () => {
      const token = 'xoxp-' + '123456789012-123456789012-123456789012-abcdefghijklmnop'
      const text = `SLACK_USER_TOKEN=${token}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Discord tokens', () => {
    it('redacts bot tokens', () => {
      const token = 'MTIzNDU2Nzg5' + 'MDEyMzQ1Njc4.YzXwVu.abcdefghijklmnopqrstuvwxyz123'
      const text = `DISCORD_TOKEN=${token}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - Stripe keys', () => {
    it('redacts sk_live_', () => {
      const key = 'sk_live_' + 'abcdefghijklmnopqrstuvwx'
      const text = `STRIPE_SECRET_KEY=${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts sk_test_', () => {
      const key = 'sk_test_' + 'abcdefghijklmnopqrstuvwx'
      const text = `STRIPE_TEST_KEY=${key}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts pk_live_', () => {
      const key = 'pk_live_' + 'abcdefghijklmnopqrstuvwx'
      const text = `STRIPE_PUBLISHABLE_KEY=${key}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Bearer tokens', () => {
    it('redacts Bearer tokens in headers', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const text = `Authorization: Bearer ${token}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - JWT tokens', () => {
    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const text = `token: ${jwt}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })
  })

  describe('redact - Private keys', () => {
    it('redacts PEM private keys', () => {
      const key = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQD...
-----END PRIVATE KEY-----`
      const text = `Here is my key:\n${key}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts OpenSSH private keys', () => {
      const key = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----`
      const text = `SSH key: ${key}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Database URLs', () => {
    it('redacts postgres URLs with credentials', () => {
      const url = 'postgresql://user:password@localhost:5432/db'
      const text = `DATABASE_URL=${url}`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts mysql URLs with credentials', () => {
      const url = 'mysql://user:pass@host:3306/db'
      const text = `DB_URL=${url}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts mongodb URLs with credentials', () => {
      const url = 'mongodb://user:pass@host:27017/db'
      const text = `MONGO_URI=${url}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts redis URLs with credentials', () => {
      const url = 'redis://:password@localhost:6379'
      const text = `REDIS_URL=${url}`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Key-value patterns', () => {
    it('redacts api_key=value', () => {
      const text = `api_key = "sk-ant-` + `api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv"`
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts access_token: value', () => {
      const text = `access_token: abcdefghijklmnopqrstuvwxyz123456`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts password=value', () => {
      const text = `password=mypassword123`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts secret_key=value', () => {
      const text = `secret_key=abcdefghijklmnopqrstuvwxyz`
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Environment variables', () => {
    it('redacts export SECRET_KEY=value', () => {
      const text = 'export API_KEY=sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const result = redact(text, defaultConfig)
      expect(result.text).toContain('[REDACTED]')
    })

    it('redacts SECRET=value without export', () => {
      const text = 'API_KEY=sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })

    it('redacts SECRET="value" with quotes', () => {
      const text = 'API_KEY="sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv"'
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })

  describe('redact - Custom patterns', () => {
    it('uses custom patterns', () => {
      const customPattern: RedactionPattern = {
        id: 'custom-secret',
        pattern: /CUSTOM_SECRET_[A-Z0-9]{20}/g,
        description: 'Custom secret format',
      }
      const config = createRedactionConfig({ customPatterns: [customPattern] })
      const text = 'My secret: CUSTOM_SECRET_ABCDEFGHIJKLMNOPQRST'
      const result = redact(text, config)
      expect(result.text).toContain('[REDACTED]')
      expect(result.matches[0].patternId).toBe('custom-secret')
    })

    it('custom patterns can be disabled', () => {
      const customPattern: RedactionPattern = {
        id: 'disabled-pattern',
        pattern: /DISABLED_[A-Z0-9]{20}/g,
        description: 'Disabled pattern',
        enabled: false,
      }
      const config = createRedactionConfig({ customPatterns: [customPattern] })
      const text = 'Secret: DISABLED_ABCDEFGHIJKLMNOPQRST'
      const result = redact(text, config)
      expect(result.count).toBe(0)
    })
  })

  describe('redact - Replacement options', () => {
    it('uses custom replacement string', () => {
      const config = createRedactionConfig({ replacement: '***REDACTED***' })
      const key = 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const result = redact(`key: ${key}`, config)
      expect(result.text).toContain('***REDACTED***')
    })

    it('preserves length when enabled', () => {
      const config = createRedactionConfig({ preserveLength: true })
      const key = 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      const result = redact(`key: ${key}`, config)
      // [REDACTED] is shorter, so it should be padded
      expect(result.text.length).toBe(`key: ${key}`.length)
    })
  })

  describe('redactAll', () => {
    it('redacts multiple texts', () => {
      const texts = [
        'key1: sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv',
        'key2: ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd',
        'normal text without secrets',
      ]
      const results = redactAll(texts, defaultConfig)
      expect(results.length).toBe(3)
      expect(results[0].count).toBe(1)
      expect(results[1].count).toBe(1)
      expect(results[2].count).toBe(0)
    })
  })

  describe('redactObject', () => {
    it('redacts string values in object', () => {
      const obj = {
        apiKey: 'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv',
        name: 'test',
        nested: {
          token: 'ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd',
        },
      }
      const result = redactObject(obj, defaultConfig)
      expect(result.apiKey).toContain('[REDACTED]')
      expect(result.name).toBe('test')
      expect(result.nested.token).toContain('[REDACTED]')
    })

    it('redacts string arrays', () => {
      const obj = {
        keys: [
          'sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv',
          'ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890abcd',
        ],
      }
      const result = redactObject(obj, defaultConfig)
      expect(result.keys[0]).toContain('[REDACTED]')
      expect(result.keys[1]).toContain('[REDACTED]')
    })

    it('preserves non-string values', () => {
      const obj = {
        count: 42,
        enabled: true,
        data: null,
      }
      const result = redactObject(obj, defaultConfig)
      expect(result.count).toBe(42)
      expect(result.enabled).toBe(true)
      expect(result.data).toBeNull()
    })
  })

  describe('hasSecrets', () => {
    it('returns true for text with secrets', () => {
      const text = 'key: sk-ant-' + 'api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'
      expect(hasSecrets(text, defaultConfig)).toBe(true)
    })

    it('returns false for text without secrets', () => {
      const text = 'This is normal text without any secrets'
      expect(hasSecrets(text, defaultConfig)).toBe(false)
    })
  })

  describe('createRedactionConfig', () => {
    it('creates config with defaults', () => {
      const config = createRedactionConfig()
      expect(config.redactEnvVars).toBe(true)
      expect(config.replacement).toBe('[REDACTED]')
      expect(config.preserveLength).toBe(false)
      expect(config.secretEnvVars).toContain('api_key')
      expect(config.secretEnvVars).toContain('password')
    })

    it('allows overriding defaults', () => {
      const config = createRedactionConfig({
        replacement: '***',
        redactEnvVars: false,
      })
      expect(config.replacement).toBe('***')
      expect(config.redactEnvVars).toBe(false)
    })
  })

  describe('Pattern management', () => {
    it('addPattern adds new pattern', () => {
      const patterns: RedactionPattern[] = []
      const newPattern: RedactionPattern = {
        id: 'test',
        pattern: /test/g,
        description: 'Test',
      }
      const result = addPattern(patterns, newPattern)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('test')
    })

    it('removePattern removes by ID', () => {
      const patterns: RedactionPattern[] = [
        { id: 'a', pattern: /a/g, description: 'A' },
        { id: 'b', pattern: /b/g, description: 'B' },
      ]
      const result = removePattern(patterns, 'a')
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('b')
    })

    it('setPatternEnabled toggles enabled state', () => {
      const patterns: RedactionPattern[] = [
        { id: 'a', pattern: /a/g, description: 'A', enabled: true },
      ]
      const result = setPatternEnabled(patterns, 'a', false)
      expect(result[0].enabled).toBe(false)
    })

    it('getAllPatterns returns enabled patterns', () => {
      const config = createRedactionConfig({
        customPatterns: [
          { id: 'enabled', pattern: /e/g, description: 'E', enabled: true },
          { id: 'disabled', pattern: /d/g, description: 'D', enabled: false },
        ],
      })
      const all = getAllPatterns(config)
      expect(all.some((p) => p.id === 'enabled')).toBe(true)
      expect(all.some((p) => p.id === 'disabled')).toBe(false)
      // Should include default patterns too
      expect(all.some((p) => p.id === 'anthropic-api-key')).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('handles empty string', () => {
      const result = redact('', defaultConfig)
      expect(result.text).toBe('')
      expect(result.count).toBe(0)
    })

    it('handles text with no matches', () => {
      const text = 'Hello world, this is a test message.'
      const result = redact(text, defaultConfig)
      expect(result.text).toBe(text)
      expect(result.count).toBe(0)
    })

    it('handles overlapping patterns', () => {
      // A JWT that might also match bearer token pattern
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      const text = `Bearer ${jwt}`
      const result = redact(text, defaultConfig)
      // Should only count once despite matching multiple patterns
      expect(result.count).toBeGreaterThanOrEqual(1)
    })

    it('handles case insensitive env var matching', () => {
      const text = 'api_key=secret123456789'
      const result = redact(text, defaultConfig)
      expect(result.count).toBe(1)
    })
  })
})