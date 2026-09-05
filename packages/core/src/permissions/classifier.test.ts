import { describe, it, expect, beforeEach } from 'bun:test'
import {
  extractBaseCommand,
  hasPipes,
  hasVariables,
  classifyCommand,
  classifyCommands,
  getHighestRisk,
  isCircuitBreaker,
  getRiskDescription,
  getRiskColor,
  meetsRiskThreshold,
  RiskLevel,
  ClassificationResult,
} from './classifier'

describe('Command Risk Classifier', () => {
  describe('extractBaseCommand', () => {
    it('extracts simple command', () => {
      expect(extractBaseCommand('ls -la')).toBe('ls')
      expect(extractBaseCommand('cat file.txt')).toBe('cat')
      expect(extractBaseCommand('echo hello')).toBe('echo')
    })

    it('handles pipes', () => {
      expect(extractBaseCommand('echo hello | grep h')).toBe('echo')
      expect(extractBaseCommand('cat file | grep pattern | sort')).toBe('cat')
    })

    it('handles semicolons', () => {
      expect(extractBaseCommand('ls; echo done')).toBe('ls')
      expect(extractBaseCommand('npm install; npm test')).toBe('npm')
    })

    it('handles && and ||', () => {
      expect(extractBaseCommand('npm install && npm test')).toBe('npm')
      expect(extractBaseCommand('npm test || echo failed')).toBe('npm')
    })

    it('skips variable assignments', () => {
      expect(extractBaseCommand('FOO=bar npm install')).toBe('npm')
      expect(extractBaseCommand('PATH=/usr/bin:$PATH ls')).toBe('ls')
    })
  })

  describe('hasPipes', () => {
    it('detects pipes', () => {
      expect(hasPipes('echo hello | grep h')).toBe(true)
      expect(hasPipes('cat file | sort | uniq')).toBe(true)
    })

    it('returns false for no pipes', () => {
      expect(hasPipes('ls -la')).toBe(false)
      expect(hasPipes('echo hello')).toBe(false)
    })
  })

  describe('hasVariables', () => {
    it('detects variable expansions', () => {
      expect(hasVariables('echo $HOME')).toBe(true)
      expect(hasVariables('echo ${HOME}')).toBe(true)
      expect(hasVariables('ls $PWD/src')).toBe(true)
    })

    it('returns false for no variables', () => {
      expect(hasVariables('ls -la')).toBe(false)
      expect(hasVariables('echo hello')).toBe(false)
    })
  })

  describe('classifyCommand - Critical', () => {
    const criticalCommands = [
      'rm -rf /',
      'rm -fr /',
      'rm -rf ~',
      'rm -fr ~',
      'sudo rm -rf /',
      'sudo rm -rf ~',
      'dd if=/dev/zero of=/dev/sda',
      'mkfs.ext4 /dev/sda1',
      'fdisk /dev/sda',
      'parted /dev/sda',
      'shutdown -h now',
      'reboot',
      'halt',
      'init 0',
      'systemctl poweroff',
      'systemctl halt',
      'systemctl reboot',
      ':(){ :|:& };:',
    ]

    for (const cmd of criticalCommands) {
      it(`classifies "${cmd}" as critical`, () => {
        const result = classifyCommand(cmd)
        expect(result.level).toBe('critical')
        expect(result.matchedPatterns.length).toBeGreaterThan(0)
      })
    }
  })

  describe('classifyCommand - High', () => {
    const highCommands = [
      'rm -rf node_modules',
      'rm -fr dist',
      'git push --force',
      'git push -f origin main',
      'git reset --hard',
      'git clean -fd',
      'chmod -R 777 /',
      'chown -R root:root /',
      'sudo chmod -R 777 /',
      'sudo chown -R root /',
      'npm publish',
      'yarn publish',
      'pnpm publish',
      'docker rmi -f image',
      'docker rm -f container',
      'kubectl delete pod --force',
      'terraform destroy',
      'truncate -s 0 file.log',
      'shred -u file.txt',
      'wipefs -a /dev/sda',
    ]

    for (const cmd of highCommands) {
      it(`classifies "${cmd}" as high`, () => {
        const result = classifyCommand(cmd)
        expect(result.level).toBe('high')
        expect(result.matchedPatterns.length).toBeGreaterThan(0)
      })
    }
  })

  describe('classifyCommand - Medium', () => {
    const mediumCommands = [
      'npm install',
      'npm ci',
      'npm update',
      'yarn install',
      'yarn add lodash',
      'yarn upgrade',
      'pnpm install',
      'pnpm add lodash',
      'pnpm update',
      'pip install requests',
      'pip3 install requests',
      'cargo install ripgrep',
      'cargo update',
      'go get github.com/user/repo',
      'go install github.com/user/repo@latest',
      'gem install rails',
      'composer install',
      'composer update',
      'composer require laravel/framework',
      'git commit -m "message"',
      'git merge feature',
      'git rebase main',
      'git cherry-pick abc123',
      'git push origin main',
      'docker build -t myapp .',
      'docker run -d nginx',
      'docker pull nginx',
      'docker push myapp:latest',
      'docker-compose up -d',
      'docker-compose build',
      'docker-compose down',
      'kubectl apply -f deployment.yaml',
      'kubectl create -f service.yaml',
      'kubectl set image deployment/app app=nginx:latest',
      'kubectl rollout restart deployment/app',
      'helm install myapp ./chart',
      'helm upgrade myapp ./chart',
      'helm rollback myapp 1',
      'terraform apply',
      'terraform plan',
      'ansible-playbook site.yml',
      'systemctl start nginx',
      'systemctl stop nginx',
      'systemctl restart nginx',
      'systemctl enable nginx',
      'systemctl disable nginx',
      'service nginx start',
      'service nginx stop',
      'service nginx restart',
      'mount /dev/sda1 /mnt',
      'umount /mnt',
      'crontab -e',
      'ssh-keygen -t ed25519',
      'openssl req -new -x509',
      'gpg --gen-key',
      'gpg --encrypt file.txt',
      'gpg --sign file.txt',
      'chmod +x script.sh',
      'chmod -R 755 dir',
      'chown user:group file.txt',
      'ln -s target link',
      'tar -xzf archive.tar.gz',
      'tar -czf archive.tar.gz dir',
      'rsync -av --delete src/ dest/',
      'rsync -av --remove-source-files src/ dest/',
    ]

    for (const cmd of mediumCommands) {
      it(`classifies "${cmd}" as medium`, () => {
        const result = classifyCommand(cmd)
        expect(result.level).toBe('medium')
        expect(result.matchedPatterns.length).toBeGreaterThan(0)
      })
    }
  })

  describe('classifyCommand - Low', () => {
    const lowCommands = [
      'ls',
      'ls -la',
      'cat file.txt',
      'head -20 file.txt',
      'tail -20 file.txt',
      'less file.txt',
      'more file.txt',
      'echo hello',
      'printf "hello"',
      'pwd',
      'which node',
      'whereis node',
      'type ls',
      'file file.txt',
      'stat file.txt',
      'du -h',
      'df -h',
      'free -h',
      'ps aux',
      'top',
      'htop',
      'whoami',
      'id',
      'date',
      'uptime',
      'uname -a',
      'env',
      'printenv',
      'history',
      'grep pattern file.txt',
      'egrep pattern file.txt',
      'fgrep pattern file.txt',
      'find . -name "*.ts"',
      'locate file.txt',
      'man ls',
      'info ls',
      'diff file1.txt file2.txt',
      'cmp file1.txt file2.txt',
      'wc -l file.txt',
      'sort file.txt',
      'uniq file.txt',
      'cut -d, -f1 file.csv',
      'awk "{print $1}" file.txt',
      'sed "s/foo/bar/" file.txt',
      'tr "a-z" "A-Z"',
      'xargs echo',
      'tee output.txt',
      'git status',
      'git log --oneline',
      'git diff',
      'git show HEAD',
      'git branch',
      'git remote -v',
      'docker ps',
      'docker images',
      'docker logs container',
      'docker inspect container',
      'kubectl get pods',
      'kubectl describe pod mypod',
      'kubectl logs mypod',
      'kubectl top pods',
      'helm list',
      'helm status myapp',
      'helm get manifest myapp',
      'terraform show',
      'terraform output',
      'terraform providers',
    ]

    for (const cmd of lowCommands) {
      it(`classifies "${cmd}" as low`, () => {
        const result = classifyCommand(cmd)
        expect(result.level).toBe('low')
      })
    }
  })

  describe('classifyCommand - edge cases', () => {
    it('handles piped commands', () => {
      const result = classifyCommand('echo hello | grep h')
      expect(result.level).toBe('low')
      expect(result.hasPipes).toBe(true)
      expect(result.baseCommand).toBe('echo')
    })

    it('handles variable expansions', () => {
      const result = classifyCommand('echo $HOME')
      expect(result.level).toBe('low')
      expect(result.hasVariables).toBe(true)
    })

    it('handles complex pipe with medium risk', () => {
      const result = classifyCommand('npm install | grep added')
      expect(result.level).toBe('medium')
      expect(result.hasPipes).toBe(true)
    })

    it('handles sudo with low command', () => {
      const result = classifyCommand('sudo ls /root')
      expect(result.level).toBe('low') // sudo ls is low risk
    })

    it('handles unknown commands as low', () => {
      const result = classifyCommand('unknowncommand --flag')
      expect(result.level).toBe('low')
      expect(result.reason).toContain('Unknown command')
    })

    it('handles empty command', () => {
      const result = classifyCommand('')
      expect(result.level).toBe('low')
    })

    it('handles whitespace only', () => {
      const result = classifyCommand('   ')
      expect(result.level).toBe('low')
    })
  })

  describe('classifyCommands', () => {
    it('classifies multiple commands', () => {
      const results = classifyCommands([
        'ls',
        'npm install',
        'rm -rf node_modules',
      ])
      expect(results.length).toBe(3)
      expect(results[0].level).toBe('low')
      expect(results[1].level).toBe('medium')
      expect(results[2].level).toBe('high')
    })
  })

  describe('getHighestRisk', () => {
    it('returns critical when present', () => {
      const results: ClassificationResult[] = [
        { level: 'low', baseCommand: 'ls', matchedPatterns: [], hasPipes: false, hasVariables: false, reason: '' },
        { level: 'critical', baseCommand: 'rm', matchedPatterns: ['rm -rf /'], hasPipes: false, hasVariables: false, reason: '' },
      ]
      expect(getHighestRisk(results)).toBe('critical')
    })

    it('returns high when no critical', () => {
      const results: ClassificationResult[] = [
        { level: 'low', baseCommand: 'ls', matchedPatterns: [], hasPipes: false, hasVariables: false, reason: '' },
        { level: 'high', baseCommand: 'rm', matchedPatterns: ['rm -rf'], hasPipes: false, hasVariables: false, reason: '' },
      ]
      expect(getHighestRisk(results)).toBe('high')
    })

    it('returns medium when no high/critical', () => {
      const results: ClassificationResult[] = [
        { level: 'low', baseCommand: 'ls', matchedPatterns: [], hasPipes: false, hasVariables: false, reason: '' },
        { level: 'medium', baseCommand: 'npm', matchedPatterns: ['npm install'], hasPipes: false, hasVariables: false, reason: '' },
      ]
      expect(getHighestRisk(results)).toBe('medium')
    })

    it('returns low when all low', () => {
      const results: ClassificationResult[] = [
        { level: 'low', baseCommand: 'ls', matchedPatterns: [], hasPipes: false, hasVariables: false, reason: '' },
        { level: 'low', baseCommand: 'cat', matchedPatterns: [], hasPipes: false, hasVariables: false, reason: '' },
      ]
      expect(getHighestRisk(results)).toBe('low')
    })
  })

  describe('isCircuitBreaker', () => {
    it('returns true for critical patterns', () => {
      expect(isCircuitBreaker('rm -rf /')).toBe(true)
      expect(isCircuitBreaker('rm -rf ~')).toBe(true)
      expect(isCircuitBreaker('sudo rm -rf /')).toBe(true)
      expect(isCircuitBreaker('dd if=/dev/zero of=/dev/sda')).toBe(true)
      expect(isCircuitBreaker(':(){ :|:& };:')).toBe(true)
    })

    it('returns false for non-critical', () => {
      expect(isCircuitBreaker('rm -rf node_modules')).toBe(false)
      expect(isCircuitBreaker('git push --force')).toBe(false)
      expect(isCircuitBreaker('npm install')).toBe(false)
      expect(isCircuitBreaker('ls')).toBe(false)
    })
  })

  describe('getRiskDescription', () => {
    it('returns correct descriptions', () => {
      expect(getRiskDescription('low')).toBe('Low risk - read-only or safe operations')
      expect(getRiskDescription('medium')).toBe('Medium risk - modifies project state')
      expect(getRiskDescription('high')).toBe('High risk - destructive or irreversible operations')
      expect(getRiskDescription('critical')).toBe('Critical risk - system-level destruction')
    })
  })

  describe('getRiskColor', () => {
    it('returns correct colors', () => {
      expect(getRiskColor('low')).toBe('green')
      expect(getRiskColor('medium')).toBe('yellow')
      expect(getRiskColor('high')).toBe('orange')
      expect(getRiskColor('critical')).toBe('red')
    })
  })

  describe('meetsRiskThreshold', () => {
    it('checks threshold correctly', () => {
      expect(meetsRiskThreshold('critical', 'high')).toBe(true)
      expect(meetsRiskThreshold('high', 'high')).toBe(true)
      expect(meetsRiskThreshold('medium', 'high')).toBe(false)
      expect(meetsRiskThreshold('low', 'high')).toBe(false)
      expect(meetsRiskThreshold('medium', 'medium')).toBe(true)
      expect(meetsRiskThreshold('low', 'low')).toBe(true)
    })
  })

  describe('ClassificationResult structure', () => {
    it('has all required fields', () => {
      const result = classifyCommand('npm install')
      expect(result).toHaveProperty('level')
      expect(result).toHaveProperty('baseCommand')
      expect(result).toHaveProperty('matchedPatterns')
      expect(result).toHaveProperty('hasPipes')
      expect(result).toHaveProperty('hasVariables')
      expect(result).toHaveProperty('reason')
    })

    it('matchedPatterns is array of strings', () => {
      const result = classifyCommand('rm -rf node_modules')
      expect(Array.isArray(result.matchedPatterns)).toBe(true)
      expect(typeof result.matchedPatterns[0]).toBe('string')
    })
  })
})