import { describe, it, expect, beforeEach } from 'bun:test'
import {
  globToRegex,
  compileCondition,
  compileRule,
  compileRules,
  matchTarget,
  matchRule,
  matchRules,
  parseRuleString,
  PermissionRuleDSL,
  CompiledRule,
  ToolCategory,
  RuleCondition,
  DEFAULT_RULES,
} from './rules'

describe('Rules DSL', () => {
  describe('globToRegex', () => {
    it('converts simple glob patterns', () => {
      expect(globToRegex('*.ts').test('file.ts')).toBe(true)
      expect(globToRegex('*.ts').test('file.js')).toBe(false)
      expect(globToRegex('*.ts').test('dir/file.ts')).toBe(false) // * doesn't match /
    })

    it('converts ** for recursive matching', () => {
      expect(globToRegex('**/*.ts').test('file.ts')).toBe(true)
      expect(globToRegex('**/*.ts').test('dir/file.ts')).toBe(true)
      expect(globToRegex('**/*.ts').test('a/b/c/file.ts')).toBe(true)
    })

    it('converts ? for single char', () => {
      expect(globToRegex('file?.ts').test('file1.ts')).toBe(true)
      expect(globToRegex('file?.ts').test('file.ts')).toBe(false)
    })

    it('converts character classes', () => {
      expect(globToRegex('file[12].ts').test('file1.ts')).toBe(true)
      expect(globToRegex('file[12].ts').test('file2.ts')).toBe(true)
      expect(globToRegex('file[12].ts').test('file3.ts')).toBe(false)
    })

    it('handles negation in path patterns', () => {
      const regex = globToRegex('!src/**')
      // Note: negation is handled at rule level, not regex level
      // This regex will match "src/..." literally
      expect(regex.test('src/file.ts')).toBe(false) // actually matches literal
    })

    it('escapes special regex chars', () => {
      expect(globToRegex('file.ts').test('file.ts')).toBe(true)
      expect(globToRegex('file.ts').test('fileXts')).toBe(false)
    })

    it('handles complex patterns', () => {
      expect(globToRegex('src/**/*.test.ts').test('src/foo.test.ts')).toBe(true)
      expect(globToRegex('src/**/*.test.ts').test('src/bar/baz.test.ts')).toBe(true)
      expect(globToRegex('src/**/*.test.ts').test('test.ts')).toBe(false)
    })
  })

  describe('compileCondition', () => {
    it('compiles path condition', () => {
      const condition: RuleCondition = { type: 'path', pattern: '*.ts', argKey: 'path' }
      const compiled = compileCondition(condition)

      expect(compiled.type).toBe('path')
      expect(compiled.argKey).toBe('path')
      expect(compiled.matcher('file.ts')).toBe(true)
      expect(compiled.matcher('file.js')).toBe(false)
    })

    it('compiles command condition', () => {
      const condition: RuleCondition = { type: 'command', pattern: 'rm -rf', argKey: 'command' }
      const compiled = compileCondition(condition)

      expect(compiled.type).toBe('command')
      expect(compiled.matcher('rm -rf /')).toBe(true)
      expect(compiled.matcher('ls -la')).toBe(false)
    })

    it('compiles custom condition', () => {
      const condition: RuleCondition = {
        type: 'custom',
        fn: (args) => args.dangerous === true,
        argKey: 'args',
      }
      const compiled = compileCondition(condition)

      expect(compiled.type).toBe('custom')
      expect(compiled.matcher(JSON.stringify({ dangerous: true }))).toBe(true)
      expect(compiled.matcher(JSON.stringify({ dangerous: false }))).toBe(false)
    })

    it('uses default argKey when not specified', () => {
      const pathCond = compileCondition({ type: 'path', pattern: '*.ts' })
      expect(pathCond.argKey).toBe('path')

      const cmdCond = compileCondition({ type: 'command', pattern: 'rm' })
      expect(cmdCond.argKey).toBe('command')
    })
  })

  describe('compileRule', () => {
    it('compiles basic rule', () => {
      const rule: PermissionRuleDSL = {
        decision: 'allow',
        target: 'read',
      }
      const compiled = compileRule(rule)

      expect(compiled.decision).toBe('allow')
      expect(compiled.target).toBe('read')
      expect(compiled.priority).toBe(0)
      expect(compiled.id).toBeDefined()
    })

    it('compiles rule with conditions', () => {
      const rule: PermissionRuleDSL = {
        decision: 'deny',
        target: 'bash',
        conditions: [{ type: 'command', pattern: 'rm -rf' }],
        priority: 100,
        description: 'Block rm -rf',
      }
      const compiled = compileRule(rule)

      expect(compiled.conditions.length).toBe(1)
      expect(compiled.priority).toBe(100)
      expect(compiled.description).toBe('Block rm -rf')
    })

    it('uses provided id or generates one', () => {
      const withId = compileRule({ decision: 'allow', target: 'read', id: 'custom-id' })
      expect(withId.id).toBe('custom-id')

      const withoutId = compileRule({ decision: 'allow', target: 'read' })
      expect(withoutId.id).toBeDefined()
      expect(withoutId.id).not.toBe('custom-id')
    })
  })

  describe('compileRules', () => {
    it('sorts by priority descending', () => {
      const rules: PermissionRuleDSL[] = [
        { decision: 'allow', target: 'read', priority: 10 },
        { decision: 'deny', target: 'write', priority: 100 },
        { decision: 'ask', target: 'bash', priority: 50 },
      ]
      const compiled = compileRules(rules)

      expect(compiled[0].priority).toBe(100)
      expect(compiled[1].priority).toBe(50)
      expect(compiled[2].priority).toBe(10)
    })
  })

  describe('matchTarget', () => {
    it('matches wildcard', () => {
      expect(matchTarget('*', 'anyTool', 'read')).toBe(true)
      expect(matchTarget('*', 'bash', 'bash')).toBe(true)
    })

    it('matches tool name', () => {
      expect(matchTarget('readFile', 'readFile', 'read')).toBe(true)
      expect(matchTarget('readFile', 'writeFile', 'write')).toBe(false)
    })

    it('matches category', () => {
      expect(matchTarget('read', 'readFile', 'read')).toBe(true)
      expect(matchTarget('read', 'glob', 'glob')).toBe(false)
      expect(matchTarget('write', 'writeFile', 'write')).toBe(true)
    })
  })

  describe('matchRule', () => {
    const compiledRule: CompiledRule = {
      id: 'test-1',
      target: 'write',
      decision: 'deny',
      conditions: [
        {
          type: 'path',
          matcher: (v) => v.startsWith('dist/'),
          argKey: 'path',
          originalPattern: 'dist/**',
        },
      ],
      priority: 50,
    }

    it('matches when target and conditions match', () => {
      const result = matchRule(compiledRule, 'writeFile', 'write', { path: 'dist/bundle.js' })
      expect(result.matched).toBe(true)
      expect(result.decision).toBe('deny')
      expect(result.matchedConditions.length).toBe(1)
    })

    it('does not match when target differs', () => {
      const result = matchRule(compiledRule, 'readFile', 'read', { path: 'dist/bundle.js' })
      expect(result.matched).toBe(false)
    })

    it('does not match when condition fails', () => {
      const result = matchRule(compiledRule, 'writeFile', 'write', { path: 'src/index.ts' })
      expect(result.matched).toBe(false)
    })

    it('does not match when arg is missing', () => {
      const result = matchRule(compiledRule, 'writeFile', 'write', { content: 'hello' })
      expect(result.matched).toBe(false)
    })

    it('matches category target', () => {
      const catRule: CompiledRule = {
        ...compiledRule,
        target: 'write',
      }
      const result = matchRule(catRule, 'editFile', 'edit', { path: 'dist/bundle.js' })
      // category 'edit' != 'write'
      expect(result.matched).toBe(false)
    })
  })

  describe('matchRules', () => {
    it('returns first matching rule (highest priority)', () => {
      const rules: CompiledRule[] = [
        { id: '1', target: 'write', decision: 'allow', conditions: [], priority: 10 },
        { id: '2', target: 'write', decision: 'deny', conditions: [], priority: 100 },
      ]
      const result = matchRules(rules, 'writeFile', 'write', {})
      expect(result.matched).toBe(true)
      expect(result.rule?.id).toBe('2') // Higher priority
    })

    it('returns no match when none match', () => {
      const rules: CompiledRule[] = [
        { id: '1', target: 'read', decision: 'allow', conditions: [], priority: 10 },
      ]
      const result = matchRules(rules, 'writeFile', 'write', {})
      expect(result.matched).toBe(false)
    })
  })

  describe('parseRuleString', () => {
    it('parses basic allow rule', () => {
      const rule = parseRuleString('allow readFile')
      expect(rule).not.toBeNull()
      expect(rule?.decision).toBe('allow')
      expect(rule?.target).toBe('readFile')
    })

    it('parses deny rule with path condition', () => {
      const rule = parseRuleString('deny writeFile for path:dist/**')
      expect(rule).not.toBeNull()
      expect(rule?.decision).toBe('deny')
      expect(rule?.target).toBe('writeFile')
      expect(rule?.conditions?.length).toBe(1)
      expect(rule?.conditions?.[0].type).toBe('path')
      expect(rule?.conditions?.[0].pattern).toBe('dist/**')
    })

    it('parses ask rule with command condition', () => {
      const rule = parseRuleString('ask bash for command:.*rm.*')
      expect(rule).not.toBeNull()
      expect(rule?.decision).toBe('ask')
      expect(rule?.target).toBe('bash')
      expect(rule?.conditions?.[0].type).toBe('command')
      expect(rule?.conditions?.[0].pattern).toBe('.*rm.*')
    })

    it('parses multiple conditions with "and"', () => {
      const rule = parseRuleString('deny bash for command:rm and path:**')
      expect(rule).not.toBeNull()
      expect(rule?.conditions?.length).toBe(2)
    })

    it('parses wildcard target', () => {
      const rule = parseRuleString('allow *')
      expect(rule).not.toBeNull()
      expect(rule?.target).toBe('*')
    })

    it('returns null for invalid format', () => {
      expect(parseRuleString('invalid')).toBeNull()
      expect(parseRuleString('allow')).toBeNull()
      expect(parseRuleString('')).toBeNull()
    })
  })

  describe('DEFAULT_RULES', () => {
    it('has expected default rules', () => {
      expect(DEFAULT_RULES.length).toBeGreaterThan(0)

      const readAllow = DEFAULT_RULES.find((r) => r.target === 'read' && r.decision === 'allow')
      expect(readAllow).toBeDefined()

      const rmDeny = DEFAULT_RULES.find((r) =>
        r.target === 'bash' && r.decision === 'deny' && r.conditions?.some((c) => c.pattern.includes('rm'))
      )
      expect(rmDeny).toBeDefined()

      const sensitiveDeny = DEFAULT_RULES.find((r) =>
        r.target === 'write' && r.decision === 'deny' && r.conditions?.some((c) => c.pattern.includes('secret'))
      )
      expect(sensitiveDeny).toBeDefined()
    })

    it('compiles without errors', () => {
      const compiled = compileRules(DEFAULT_RULES)
      expect(compiled.length).toBe(DEFAULT_RULES.length)
    })
  })

  describe('integration with categories', () => {
    it('matches category target correctly', () => {
      const rule = compileRule({
        decision: 'allow',
        target: 'read',
      })

      // These tools should all match 'read' category
      for (const tool of ['readFile', 'read']) {
        const result = matchRule(rule, tool, 'read', {})
        expect(result.matched).toBe(true)
      }
    })

    it('path condition matches file paths correctly', () => {
      const rule = compileRule({
        decision: 'ask',
        target: 'write',
        conditions: [{ type: 'path', pattern: 'src/**' }],
      })

      expect(matchRule(rule, 'writeFile', 'write', { path: 'src/index.ts' }).matched).toBe(true)
      expect(matchRule(rule, 'writeFile', 'write', { path: 'src/components/Button.tsx' }).matched).toBe(true)
      expect(matchRule(rule, 'writeFile', 'write', { path: 'dist/index.js' }).matched).toBe(false)
      expect(matchRule(rule, 'writeFile', 'write', { path: 'package.json' }).matched).toBe(false)
    })

    it('command condition matches regex correctly', () => {
      const rule = compileRule({
        decision: 'deny',
        target: 'bash',
        conditions: [{ type: 'command', pattern: 'rm\\s+-rf' }],
      })

      expect(matchRule(rule, 'bash', 'bash', { command: 'rm -rf /' }).matched).toBe(true)
      expect(matchRule(rule, 'bash', 'bash', { command: 'rm -rf folder' }).matched).toBe(true)
      expect(matchRule(rule, 'bash', 'bash', { command: 'rm file.txt' }).matched).toBe(false)
      expect(matchRule(rule, 'bash', 'bash', { command: 'ls -la' }).matched).toBe(false)
    })
  })
})