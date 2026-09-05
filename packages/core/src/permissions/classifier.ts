/** Risk level for a command. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** Result of command classification. */
export interface ClassificationResult {
  /** The classified risk level. */
  level: RiskLevel
  /** The base command that was classified. */
  baseCommand: string
  /** Matched patterns that contributed to classification. */
  matchedPatterns: string[]
  /** Whether the command contains piping/redirection. */
  hasPipes: boolean
  /** Whether the command contains variable expansion. */
  hasVariables: boolean
  /** Human-readable reason for classification. */
  reason: string
}

/** Command pattern with risk level. */
interface CommandPattern {
  pattern: RegExp
  level: RiskLevel
  description: string
}

/** Patterns ordered by specificity (more specific first). */
const CRITICAL_PATTERNS: CommandPattern[] = [
  { pattern: /^rm\s+(-rf|-fr)\s+\/\s*$/, level: 'critical', description: 'rm -rf / (delete root filesystem)' },
  { pattern: /^rm\s+(-rf|-fr)\s+\/\s*;/, level: 'critical', description: 'rm -rf / followed by more commands' },
  { pattern: /^rm\s+(-rf|-fr)\s+\/\s*\|\|/, level: 'critical', description: 'rm -rf / with conditional execution' },
  { pattern: /^rm\s+(-rf|-fr)\s+\/\s*&&/, level: 'critical', description: 'rm -rf / with conditional execution' },
  { pattern: /^rm\s+(-rf|-fr)\s+~\s*$/, level: 'critical', description: 'rm -rf ~ (delete home directory)' },
  { pattern: /^sudo\s+rm\s+(-rf|-fr)\s+\//, level: 'critical', description: 'sudo rm -rf /' },
  { pattern: /^sudo\s+rm\s+(-rf|-fr)\s+~/, level: 'critical', description: 'sudo rm -rf ~' },
  { pattern: /^dd\s+if=.*of=\/(dev|dev\/sda)/, level: 'critical', description: 'dd writing to disk device' },
  { pattern: /^mkfs\./, level: 'critical', description: 'Formatting filesystem' },
  { pattern: /^fdisk\s/, level: 'critical', description: 'Disk partitioning' },
  { pattern: /^parted\s/, level: 'critical', description: 'Disk partitioning' },
  { pattern: /^shutdown(\s|$)/, level: 'critical', description: 'System shutdown' },
  { pattern: /^reboot(\s|$)/, level: 'critical', description: 'System reboot' },
  { pattern: /^halt(\s|$)/, level: 'critical', description: 'System halt' },
  { pattern: /^init\s+0/, level: 'critical', description: 'Init 0 (shutdown)' },
  { pattern: /^systemctl\s+(poweroff|halt|reboot)/, level: 'critical', description: 'Systemctl power management' },
  { pattern: /^:\(\)\{.*:.*\|.*:.*&.*\}/, level: 'critical', description: 'Fork bomb' },
]

const HIGH_PATTERNS: CommandPattern[] = [
  { pattern: /^rm\s+(-rf|-fr)\s+/, level: 'high', description: 'Recursive force delete' },
  { pattern: /^git\s+push\s+.*--force/, level: 'high', description: 'Git force push' },
  { pattern: /^git\s+push\s+.*-f\s/, level: 'high', description: 'Git force push (short)' },
  { pattern: /^git\s+reset\s+--hard/, level: 'high', description: 'Git hard reset' },
  { pattern: /^git\s+clean\s+(-fd|-df)/, level: 'high', description: 'Git clean with force' },
  { pattern: /^chmod\s+-R\s+777/, level: 'high', description: 'Recursive 777 permissions' },
  { pattern: /^chown\s+-R\s+root/, level: 'high', description: 'Recursive chown to root' },
  { pattern: /^sudo\s+chmod\s+-R/, level: 'high', description: 'Sudo recursive chmod' },
  { pattern: /^sudo\s+chown\s+-R/, level: 'high', description: 'Sudo recursive chown' },
  { pattern: /^npm\s+publish/, level: 'high', description: 'Publishing npm package' },
  { pattern: /^yarn\s+publish/, level: 'high', description: 'Publishing yarn package' },
  { pattern: /^pnpm\s+publish/, level: 'high', description: 'Publishing pnpm package' },
  { pattern: /^docker\s+(rmi|rm)\s+.*-f/, level: 'high', description: 'Force remove Docker images/containers' },
  { pattern: /^kubectl\s+delete\s+.*--force/, level: 'high', description: 'Force delete Kubernetes resources' },
  { pattern: /^terraform\s+destroy/, level: 'high', description: 'Terraform destroy infrastructure' },
  { pattern: /^truncate\s+-s\s+0/, level: 'high', description: 'Truncate file to zero' },
  { pattern: /^shred\s+/, level: 'high', description: 'Secure file deletion' },
  { pattern: /^wipe(f\s+)?/, level: 'high', description: 'Wipe filesystem' },
  { pattern: /^pvcreate\s+/, level: 'high', description: 'Create physical volume (LVM)' },
  { pattern: /^vgcreate\s+/, level: 'high', description: 'Create volume group (LVM)' },
  { pattern: /^lvcreate\s+/, level: 'high', description: 'Create logical volume (LVM)' },
]

const MEDIUM_PATTERNS: CommandPattern[] = [
  { pattern: /^npm\s+(install|ci|update)/, level: 'medium', description: 'NPM install/update' },
  { pattern: /^yarn\s+(install|add|upgrade)/, level: 'medium', description: 'Yarn install/add/upgrade' },
  { pattern: /^pnpm\s+(install|add|update)/, level: 'medium', description: 'PNPM install/add/update' },
  { pattern: /^pip\s+install/, level: 'medium', description: 'Pip install' },
  { pattern: /^pip3\s+install/, level: 'medium', description: 'Pip3 install' },
  { pattern: /^cargo\s+(install|update)/, level: 'medium', description: 'Cargo install/update' },
  { pattern: /^go\s+(get|install)/, level: 'medium', description: 'Go get/install' },
  { pattern: /^gem\s+install/, level: 'medium', description: 'Gem install' },
  { pattern: /^composer\s+(install|update|require)/, level: 'medium', description: 'Composer install/update' },
  { pattern: /^git\s+(commit|merge|rebase|cherry-pick)/, level: 'medium', description: 'Git commit/merge/rebase' },
  { pattern: /^git\s+push\s+(?!.*--force)(?!.*-f\s)/, level: 'medium', description: 'Git push (normal)' },
  { pattern: /^docker\s+(build|run|pull|push)/, level: 'medium', description: 'Docker build/run/pull/push' },
  { pattern: /^docker-compose\s+(up|build|down)/, level: 'medium', description: 'Docker compose operations' },
  { pattern: /^kubectl\s+(apply|create|set|rollout)/, level: 'medium', description: 'Kubectl apply/create' },
  { pattern: /^helm\s+(install|upgrade|rollback)/, level: 'medium', description: 'Helm install/upgrade' },
  { pattern: /^terraform\s+(apply|plan)/, level: 'medium', description: 'Terraform apply/plan' },
  { pattern: /^ansible-playbook\s+/, level: 'medium', description: 'Ansible playbook execution' },
  { pattern: /^systemctl\s+(start|stop|restart|enable|disable)/, level: 'medium', description: 'Service management' },
  { pattern: /^service\s+\w+\s+(start|stop|restart)/, level: 'medium', description: 'Service management (sysv)' },
  { pattern: /^mount\s+/, level: 'medium', description: 'Mount filesystem' },
  { pattern: /^umount\s+/, level: 'medium', description: 'Unmount filesystem' },
  { pattern: /^crontab\s+-e/, level: 'medium', description: 'Edit crontab' },
  { pattern: /^ssh-keygen\s+/, level: 'medium', description: 'Generate SSH keys' },
  { pattern: /^openssl\s+/, level: 'medium', description: 'OpenSSL operations' },
  { pattern: /^gpg\s+(--gen-key|--encrypt|--sign)/, level: 'medium', description: 'GPG key generation/encryption' },
  { pattern: /^chmod\s+\+x/, level: 'medium', description: 'Make executable' },
  { pattern: /^chmod\s+-[Rr]/, level: 'medium', description: 'Recursive chmod' },
  { pattern: /^chown\s+/, level: 'medium', description: 'Change ownership' },
  { pattern: /^ln\s+-s/, level: 'medium', description: 'Create symlink' },
  { pattern: /^tar\s+.*[xcf]/, level: 'medium', description: 'Tar extract/create' },
  { pattern: /^rsync\s+.*(--delete|--remove-source-files)/, level: 'medium', description: 'Rsync with deletion' },
]

const LOW_PATTERNS: CommandPattern[] = [
  { pattern: /^ls/, level: 'low', description: 'List directory' },
  { pattern: /^cat\s+/, level: 'low', description: 'Display file contents' },
  { pattern: /^head\s+/, level: 'low', description: 'Show first lines' },
  { pattern: /^tail\s+/, level: 'low', description: 'Show last lines' },
  { pattern: /^less\s+/, level: 'low', description: 'View file (pager)' },
  { pattern: /^more\s+/, level: 'low', description: 'View file (pager)' },
  { pattern: /^echo\s+/, level: 'low', description: 'Print text' },
  { pattern: /^printf\s+/, level: 'low', description: 'Formatted print' },
  { pattern: /^pwd$/, level: 'low', description: 'Print working directory' },
  { pattern: /^which\s+/, level: 'low', description: 'Locate command' },
  { pattern: /^whereis\s+/, level: 'low', description: 'Locate binary/source/man' },
  { pattern: /^type\s+/, level: 'low', description: 'Show command type' },
  { pattern: /^file\s+/, level: 'low', description: 'Determine file type' },
  { pattern: /^stat\s+/, level: 'low', description: 'Show file status' },
  { pattern: /^du\s+/, level: 'low', description: 'Disk usage' },
  { pattern: /^df\s+/, level: 'low', description: 'Disk free space' },
  { pattern: /^free\s+/, level: 'low', description: 'Memory usage' },
  { pattern: /^ps\s+/, level: 'low', description: 'Process list' },
  { pattern: /^top$/, level: 'low', description: 'Process monitor' },
  { pattern: /^htop$/, level: 'low', description: 'Process monitor (interactive)' },
  { pattern: /^whoami$/, level: 'low', description: 'Current user' },
  { pattern: /^id$/, level: 'low', description: 'User/group IDs' },
  { pattern: /^date$/, level: 'low', description: 'Current date/time' },
  { pattern: /^uptime$/, level: 'low', description: 'System uptime' },
  { pattern: /^uname\s+/, level: 'low', description: 'System information' },
  { pattern: /^env$/, level: 'low', description: 'Environment variables' },
  { pattern: /^printenv$/, level: 'low', description: 'Print environment' },
  { pattern: /^history$/, level: 'low', description: 'Command history' },
  { pattern: /^grep\s+/, level: 'low', description: 'Search text' },
  { pattern: /^egrep\s+/, level: 'low', description: 'Extended grep' },
  { pattern: /^fgrep\s+/, level: 'low', description: 'Fixed string grep' },
  { pattern: /^find\s+/, level: 'low', description: 'Find files' },
  { pattern: /^locate\s+/, level: 'low', description: 'Locate files' },
  { pattern: /^which\s+/, level: 'low', description: 'Find command' },
  { pattern: /^man\s+/, level: 'low', description: 'Manual pages' },
  { pattern: /^info\s+/, level: 'low', description: 'Info documentation' },
  { pattern: /^diff\s+/, level: 'low', description: 'Compare files' },
  { pattern: /^cmp\s+/, level: 'low', description: 'Compare files byte-by-byte' },
  { pattern: /^wc\s+/, level: 'low', description: 'Word/line/char count' },
  { pattern: /^sort\s+/, level: 'low', description: 'Sort lines' },
  { pattern: /^uniq\s+/, level: 'low', description: 'Unique lines' },
  { pattern: /^cut\s+/, level: 'low', description: 'Cut fields' },
  { pattern: /^awk\s+/, level: 'low', description: 'Text processing' },
  { pattern: /^sed\s+/, level: 'low', description: 'Stream editor' },
  { pattern: /^tr\s+/, level: 'low', description: 'Translate characters' },
  { pattern: /^xargs\s+/, level: 'low', description: 'Execute from stdin' },
  { pattern: /^tee\s+/, level: 'low', description: 'Tee output' },
  { pattern: /^git\s+(status|log|diff|show|branch|remote)/, level: 'low', description: 'Git read-only operations' },
  { pattern: /^docker\s+(ps|images|logs|inspect)/, level: 'low', description: 'Docker read-only' },
  { pattern: /^kubectl\s+(get|describe|logs|top)/, level: 'low', description: 'Kubectl read-only' },
  { pattern: /^helm\s+(list|status|get)/, level: 'low', description: 'Helm read-only' },
  { pattern: /^terraform\s+(show|output|providers)/, level: 'low', description: 'Terraform read-only' },
]

/** All patterns combined, ordered by risk level (critical first). */
const ALL_PATTERNS: CommandPattern[] = [
  ...CRITICAL_PATTERNS,
  ...HIGH_PATTERNS,
  ...MEDIUM_PATTERNS,
  ...LOW_PATTERNS,
]

/** Extract the base command from a full command string. */
export function extractBaseCommand(command: string): string {
  // Handle pipes, semicolons, &&, ||
  const parts = command.split(/\s*[|;&]\s*/)
  const firstPart = parts[0].trim()

  // Handle variable assignments at start (e.g., VAR=value command)
  const words = firstPart.split(/\s+/)
  let cmd = ''
  for (const word of words) {
    if (word.includes('=') && !word.startsWith('-') && !word.startsWith('/')) {
      continue // Skip variable assignments
    }
    cmd = word
    break
  }

  return cmd || firstPart.split(/\s+/)[0] || ''
}

/** Check if command contains pipes or redirections. */
export function hasPipes(command: string): boolean {
  return /[|]/.test(command)
}

/** Check if command contains variable expansions. */
export function hasVariables(command: string): boolean {
  return /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(command)
}

/** Classify a single command's risk level. */
export function classifyCommand(command: string): ClassificationResult {
  const trimmed = command.trim()
  const baseCommand = extractBaseCommand(trimmed)
  const pipes = hasPipes(trimmed)
  const variables = hasVariables(trimmed)

  const matchedPatterns: string[] = []

  // Check all patterns in order
  for (const { pattern, level, description } of ALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      matchedPatterns.push(description)
      return {
        level,
        baseCommand,
        matchedPatterns,
        hasPipes: pipes,
        hasVariables: variables,
        reason: `Matched: ${description}`,
      }
    }
  }

  // Default to low for unknown commands
  return {
    level: 'low',
    baseCommand,
    matchedPatterns: [],
    hasPipes: pipes,
    hasVariables: variables,
    reason: 'Unknown command, defaulting to low risk',
  }
}

/** Classify multiple commands (e.g., from a script or piped sequence). */
export function classifyCommands(commands: string[]): ClassificationResult[] {
  return commands.map(classifyCommand)
}

/** Get the highest risk level from multiple classifications. */
export function getHighestRisk(results: ClassificationResult[]): RiskLevel {
  const order: RiskLevel[] = ['critical', 'high', 'medium', 'low']
  for (const level of order) {
    if (results.some((r) => r.level === level)) {
      return level
    }
  }
  return 'low'
}

/** Check if a command should trigger a circuit breaker (always prompt). */
export function isCircuitBreaker(command: string): boolean {
  const trimmed = command.trim()
  for (const { pattern } of CRITICAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true
    }
  }
  return false
}

/** Get risk level description. */
export function getRiskDescription(level: RiskLevel): string {
  const descriptions: Record<RiskLevel, string> = {
    low: 'Low risk - read-only or safe operations',
    medium: 'Medium risk - modifies project state',
    high: 'High risk - destructive or irreversible operations',
    critical: 'Critical risk - system-level destruction',
  }
  return descriptions[level]
}

/** Get risk level color for UI. */
export function getRiskColor(level: RiskLevel): string {
  const colors: Record<RiskLevel, string> = {
    low: 'green',
    medium: 'yellow',
    high: 'orange',
    critical: 'red',
  }
  return colors[level]
}

/** Check if risk level meets or exceeds threshold. */
export function meetsRiskThreshold(level: RiskLevel, threshold: RiskLevel): boolean {
  const order: RiskLevel[] = ['low', 'medium', 'high', 'critical']
  return order.indexOf(level) >= order.indexOf(threshold)
}