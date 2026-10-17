import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Structural checks for the Phase 150 distribution channels: the npm package,
 * the Homebrew formula, and the Scoop/WinGet manifests must all agree on the
 * version and point at the release asset names produced by Phase 149.
 */

const root = join(import.meta.dir, '..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const cliPackage = JSON.parse(read('packages/cli/package.json')) as {
  name: string
  version: string
  bin: Record<string, string>
  files: string[]
  publishConfig: { access: string }
  scripts: Record<string, string>
  engines: Record<string, string>
}

const VERSION = cliPackage.version
const RELEASE = `https://github.com/inbesat/Munchkin-CLI/releases/download/v${VERSION}`

describe('npm package (Phase 150)', () => {
  it('is publishable as the forge CLI', () => {
    expect(cliPackage.name).toBe('forge')
    expect(cliPackage.bin.forge).toBe('./dist/forge.js')
    expect(cliPackage.files).toContain('dist')
    expect(cliPackage.publishConfig.access).toBe('public')
    expect(cliPackage.scripts.prepack).toContain('build')
    expect(cliPackage.engines.bun).toBeDefined()
  })

  it('keeps VERSION in core in sync', () => {
    const core = read('packages/core/src/index.ts')
    expect(core.match(/VERSION\s*=\s*'([^']+)'/)?.[1]).toBe(VERSION)
  })
})

describe('homebrew formula (Phase 150)', () => {
  const formula = read('packaging/homebrew/forge.rb')

  it('covers all four binary platforms at the package version', () => {
    expect(formula).toContain('class Forge < Formula')
    expect(formula).toContain(`version "${VERSION}"`)
    for (const asset of [
      'forge-darwin-arm64',
      'forge-darwin-x64',
      'forge-linux-arm64',
      'forge-linux-x64',
    ]) {
      expect(formula).toContain(`${RELEASE}/${asset}`)
    }
    expect(formula.match(/sha256 /g)?.length).toBe(4)
  })

  it('installs the binary and tests it', () => {
    expect(formula).toContain('bin.install')
    expect(formula).toContain('test do')
    expect(formula).toContain('#{bin}/forge version')
  })
})

describe('scoop manifest (Phase 150)', () => {
  const scoop = JSON.parse(read('packaging/scoop/forge.json')) as {
    version: string
    architecture: { '64bit': { url: string; hash: string } }
    bin: string[][]
    checkver: { github: string }
    autoupdate: { architecture: { '64bit': { url: string; hash: { url: string } } } }
  }

  it('targets the Windows binary at the package version', () => {
    expect(scoop.version).toBe(VERSION)
    expect(scoop.architecture['64bit'].url).toBe(`${RELEASE}/forge-win-x64.exe`)
    expect(scoop.bin).toEqual([['forge-win-x64.exe', 'forge']])
  })

  it('auto-updates from GitHub releases with release checksums', () => {
    expect(scoop.checkver.github).toBe('https://github.com/inbesat/Munchkin-CLI')
    expect(scoop.autoupdate.architecture['64bit'].url).toContain('v$version/forge-win-x64.exe')
    expect(scoop.autoupdate.architecture['64bit'].hash.url).toBe('$baseurl/checksums.txt')
  })
})

describe('winget manifests (Phase 150)', () => {
  const version = read('packaging/winget/Inbesat.Forge.yaml')
  const locale = read('packaging/winget/Inbesat.Forge.locale.en-US.yaml')
  const installer = read('packaging/winget/Inbesat.Forge.installer.yaml')

  it('has the three manifest parts at the package version', () => {
    expect(version).toContain('PackageIdentifier: Inbesat.Forge')
    expect(version).toContain(`PackageVersion: ${VERSION}`)
    expect(version).toContain('ManifestType: version')
    expect(locale).toContain('ManifestType: defaultLocale')
    expect(locale).toContain('ShortDescription:')
    expect(installer).toContain('ManifestType: installer')
  })

  it('installs the portable Windows zip with a forge command', () => {
    expect(installer).toContain(`InstallerUrl: ${RELEASE}/forge-win-x64.zip`)
    expect(installer).toContain('InstallerSha256:')
    expect(installer).toContain('InstallerType: portable')
    expect(installer).toContain('- forge')
  })
})
