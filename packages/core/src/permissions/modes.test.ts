import { describe, it, expect, beforeEach } from 'bun:test'
import {
  PermissionMode,
  PermissionDecision,
  ToolCategory,
  getToolCategory,
  getModeRules,
  checkPermission,
  cycleMode,
  getModeDescription,
  getModeLabel,
  isValidMode,
} from './modes'
import { AgentTool } from '../agent/types'

const mockReadTool: AgentTool = {
  name: 'readFile',
  description: 'Read a file',
  execute: async () => '',
}

const mockWriteTool: AgentTool = {
  name: 'writeFile',
  description: 'Write a file',
  execute: async () => '',
}

const mockEditTool: AgentTool = {
  name: 'editFile',
  description: 'Edit a file',
  execute: async () => '',
}

const mockBashTool: AgentTool = {
  name: 'bash',
  description: 'Run bash command',
  execute: async () => '',
}

const mockGlobTool: AgentTool = {
  name: 'glob',
  description: 'Glob files',
  execute: async () => '',
}

const mockCustomTool: AgentTool = {
  name: 'customTool',
  description: 'Custom tool',
  execute: async () => '',
}

describe('Permission Modes', () => {
  describe('getToolCategory', () => {
    it('categorizes read tools', () => {
      expect(getToolCategory('readFile')).toBe('read')
      expect(getToolCategory('read')).toBe('read')
      expect(getToolCategory(mockReadTool)).toBe('read')
    })

    it('categorizes write tools', () => {
      expect(getToolCategory('writeFile')).toBe('write')
      expect(getToolCategory('write')).toBe('write')
      expect(getToolCategory(mockWriteTool)).toBe('write')
    })

    it('categorizes edit tools', () => {
      expect(getToolCategory('editFile')).toBe('edit')
      expect(getToolCategory('edit')).toBe('edit')
      expect(getToolCategory(mockEditTool)).toBe('edit')
    })

    it('categorizes bash tool', () => {
      expect(getToolCategory('bash')).toBe('bash')
      expect(getToolCategory(mockBashTool)).toBe('bash')
    })

    it('categorizes glob tool', () => {
      expect(getToolCategory('glob')).toBe('glob')
      expect(getToolCategory(mockGlobTool)).toBe('glob')
    })

    it('categorizes grep tool', () => {
      expect(getToolCategory('grep')).toBe('grep')
    })

    it('categorizes task tools', () => {
      expect(getToolCategory('todoWrite')).toBe('task')
      expect(getToolCategory('todoRead')).toBe('task')
    })

    it('categorizes web tools', () => {
      expect(getToolCategory('webFetch')).toBe('webfetch')
      expect(getToolCategory('webSearch')).toBe('websearch')
    })

    it('categorizes notebook tool', () => {
      expect(getToolCategory('notebookEdit')).toBe('notebook')
    })

    it('defaults to custom for unknown tools', () => {
      expect(getToolCategory('unknownTool')).toBe('custom')
      expect(getToolCategory(mockCustomTool)).toBe('custom')
    })
  })

  describe('getModeRules', () => {
    it('returns rules for default mode', () => {
      const rules = getModeRules('default')
      expect(rules.length).toBeGreaterThan(0)
      const readRule = rules.find((r) => r.target === 'read')
      expect(readRule?.decision).toBe('allow')
      const writeRule = rules.find((r) => r.target === 'write')
      expect(writeRule?.decision).toBe('ask')
    })

    it('returns rules for acceptEdits mode', () => {
      const rules = getModeRules('acceptEdits')
      const writeRule = rules.find((r) => r.target === 'write')
      expect(writeRule?.decision).toBe('allow')
      const bashRule = rules.find((r) => r.target === 'bash')
      expect(bashRule?.decision).toBe('ask')
    })

    it('returns rules for plan mode', () => {
      const rules = getModeRules('plan')
      for (const rule of rules) {
        expect(rule.decision).toBe('ask')
      }
    })

    it('returns rules for auto mode', () => {
      const rules = getModeRules('auto')
      for (const rule of rules) {
        expect(rule.decision).toBe('allow')
      }
    })

    it('returns rules for dontAsk mode', () => {
      const rules = getModeRules('dontAsk')
      const readRule = rules.find((r) => r.target === 'read')
      expect(readRule?.decision).toBe('allow')
      const writeRule = rules.find((r) => r.target === 'write')
      expect(writeRule?.decision).toBe('deny')
    })

    it('returns rules for bypass mode', () => {
      const rules = getModeRules('bypass')
      for (const rule of rules) {
        expect(rule.decision).toBe('allow')
      }
    })

    it('falls back to default for unknown mode', () => {
      const rules = getModeRules('unknown' as PermissionMode)
      expect(rules).toEqual(getModeRules('default'))
    })
  })

  describe('checkPermission', () => {
    const baseConfig = { mode: 'default' as PermissionMode, customRules: undefined }

    it('allows read in default mode', () => {
      const result = checkPermission(mockReadTool, {}, baseConfig)
      expect(result.decision).toBe('allow')
      expect(result.mode).toBe('default')
    })

    it('asks for write in default mode', () => {
      const result = checkPermission(mockWriteTool, {}, baseConfig)
      expect(result.decision).toBe('ask')
    })

    it('asks for edit in default mode', () => {
      const result = checkPermission(mockEditTool, {}, baseConfig)
      expect(result.decision).toBe('ask')
    })

    it('asks for bash in default mode', () => {
      const result = checkPermission(mockBashTool, {}, baseConfig)
      expect(result.decision).toBe('ask')
    })

    it('allows glob in default mode', () => {
      const result = checkPermission(mockGlobTool, {}, baseConfig)
      expect(result.decision).toBe('allow')
    })

    it('allows write in acceptEdits mode', () => {
      const result = checkPermission(mockWriteTool, {}, { mode: 'acceptEdits' })
      expect(result.decision).toBe('allow')
    })

    it('allows edit in acceptEdits mode', () => {
      const result = checkPermission(mockEditTool, {}, { mode: 'acceptEdits' })
      expect(result.decision).toBe('allow')
    })

    it('asks for bash in acceptEdits mode', () => {
      const result = checkPermission(mockBashTool, {}, { mode: 'acceptEdits' })
      expect(result.decision).toBe('ask')
    })

    it('asks for everything in plan mode', () => {
      for (const tool of [mockReadTool, mockWriteTool, mockEditTool, mockBashTool, mockGlobTool]) {
        const result = checkPermission(tool, {}, { mode: 'plan' })
        expect(result.decision).toBe('ask')
      }
    })

    it('allows everything in auto mode', () => {
      for (const tool of [mockReadTool, mockWriteTool, mockEditTool, mockBashTool, mockGlobTool]) {
        const result = checkPermission(tool, {}, { mode: 'auto' })
        expect(result.decision).toBe('allow')
      }
    })

    it('allows read but denies write in dontAsk mode', () => {
      expect(checkPermission(mockReadTool, {}, { mode: 'dontAsk' }).decision).toBe('allow')
      expect(checkPermission(mockWriteTool, {}, { mode: 'dontAsk' }).decision).toBe('deny')
      expect(checkPermission(mockEditTool, {}, { mode: 'dontAsk' }).decision).toBe('deny')
      expect(checkPermission(mockBashTool, {}, { mode: 'dontAsk' }).decision).toBe('deny')
    })

    it('allows everything in bypass mode', () => {
      for (const tool of [mockReadTool, mockWriteTool, mockEditTool, mockBashTool, mockGlobTool]) {
        const result = checkPermission(tool, {}, { mode: 'bypass' })
        expect(result.decision).toBe('allow')
      }
    })

    it('custom rules override mode defaults', () => {
      const customRules = [
        { target: 'write' as ToolCategory, decision: 'allow' as PermissionDecision },
      ]
      const result = checkPermission(mockWriteTool, {}, {
        mode: 'default',
        customRules,
      })
      expect(result.decision).toBe('allow')
      expect(result.explicit).toBe(true)
    })

    it('custom rule with condition applies conditionally', () => {
      const customRules = [
        {
          target: 'bash' as ToolCategory,
          decision: 'allow' as PermissionDecision,
          condition: (args) => !String(args.command).includes('rm'),
        },
      ]
      const allowResult = checkPermission(mockBashTool, { command: 'ls' }, {
        mode: 'default',
        customRules,
      })
      expect(allowResult.decision).toBe('allow')

      const denyResult = checkPermission(mockBashTool, { command: 'rm -rf /' }, {
        mode: 'default',
        customRules,
      })
      expect(denyResult.decision).toBe('ask') // Falls back to mode default
    })

    it('matches by tool name when specified', () => {
      const customRules = [
        { target: 'bash', decision: 'allow' as PermissionDecision },
      ]
      const result = checkPermission(mockBashTool, {}, {
        mode: 'default',
        customRules,
      })
      expect(result.decision).toBe('allow')
    })

    it('returns explicit=true for custom rules', () => {
      const customRules = [
        { target: 'write' as ToolCategory, decision: 'allow' as PermissionDecision },
      ]
      const result = checkPermission(mockWriteTool, {}, {
        mode: 'default',
        customRules,
      })
      expect(result.explicit).toBe(true)
    })

    it('returns explicit=false for mode defaults', () => {
      const result = checkPermission(mockReadTool, {}, { mode: 'default' })
      expect(result.explicit).toBe(false)
    })
  })

  describe('cycleMode', () => {
    it('cycles through all modes in order', () => {
      expect(cycleMode('default')).toBe('acceptEdits')
      expect(cycleMode('acceptEdits')).toBe('plan')
      expect(cycleMode('plan')).toBe('auto')
      expect(cycleMode('auto')).toBe('dontAsk')
      expect(cycleMode('dontAsk')).toBe('bypass')
      expect(cycleMode('bypass')).toBe('default')
    })
  })

  describe('getModeDescription', () => {
    it('returns description for each mode', () => {
      expect(getModeDescription('default')).toContain('Ask for write')
      expect(getModeDescription('acceptEdits')).toContain('Allow write')
      expect(getModeDescription('plan')).toContain('Ask for everything')
      expect(getModeDescription('auto')).toContain('Allow everything')
      expect(getModeDescription('dontAsk')).toContain('deny write')
      expect(getModeDescription('bypass')).toContain('no checks')
    })
  })

  describe('getModeLabel', () => {
    it('returns short label for each mode', () => {
      expect(getModeLabel('default')).toBe('DEFAULT')
      expect(getModeLabel('acceptEdits')).toBe('ACCEPT EDITS')
      expect(getModeLabel('plan')).toBe('PLAN')
      expect(getModeLabel('auto')).toBe('AUTO')
      expect(getModeLabel('dontAsk')).toBe('DONT ASK')
      expect(getModeLabel('bypass')).toBe('BYPASS')
    })
  })

  describe('isValidMode', () => {
    it('validates correct modes', () => {
      expect(isValidMode('default')).toBe(true)
      expect(isValidMode('acceptEdits')).toBe(true)
      expect(isValidMode('plan')).toBe(true)
      expect(isValidMode('auto')).toBe(true)
      expect(isValidMode('dontAsk')).toBe(true)
      expect(isValidMode('bypass')).toBe(true)
    })

    it('rejects invalid modes', () => {
      expect(isValidMode('invalid')).toBe(false)
      expect(isValidMode('')).toBe(false)
      expect(isValidMode('readOnly')).toBe(false)
    })
  })
})