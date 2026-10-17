import { type UpdateFetch, VERSION, checkForUpdate, formatUpdateNotice } from '@forge/core'

export interface UpdateCommandOptions {
  write?: (line: string) => void
  errorWrite?: (line: string) => void
  endpoint?: string
  fetch?: UpdateFetch
  cacheFile?: string
  now?: () => number
}

/**
 * `forge update [--json]` (Phase 150). Forces a version check against the npm
 * registry and reports the result. Installation itself is left to the package
 * manager (`npm i -g forge`, brew, scoop, winget).
 */
export async function runUpdateCommand(
  rawArgv: string[],
  opts: UpdateCommandOptions = {},
): Promise<number> {
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const errorWrite = opts.errorWrite ?? ((line: string) => process.stderr.write(`${line}\n`))
  const argv = rawArgv[0] === 'update' ? rawArgv.slice(1) : rawArgv
  const json = argv.includes('--json')
  const endpoint = opts.endpoint ?? process.env.FORGE_UPDATE_ENDPOINT

  try {
    const result = await checkForUpdate({
      currentVersion: VERSION,
      ttlMs: 0, // explicit check: always query the registry
      ...(endpoint !== undefined ? { endpoint } : {}),
      ...(opts.fetch !== undefined ? { fetch: opts.fetch } : {}),
      ...(opts.cacheFile !== undefined ? { cacheFile: opts.cacheFile } : {}),
      ...(opts.now !== undefined ? { now: opts.now } : {}),
    })
    if (json) {
      write(JSON.stringify(result, null, 2))
    } else {
      write(
        formatUpdateNotice(result) ??
          `forge ${result.currentVersion} is up to date (latest ${result.latestVersion})`,
      )
    }
    return 0
  } catch (err) {
    errorWrite(`error: update check failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}
