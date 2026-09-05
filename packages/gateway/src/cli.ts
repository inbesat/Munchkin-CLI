import { DEFAULT_PORT } from './constants'
import { startGateway } from './server'

function argValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`
  const inline = args.find((a) => a.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = args.indexOf(name)
  if (index >= 0) return args[index + 1]
  return undefined
}

/**
 * CLI entrypoint for the gateway. Reads port/host from flags or env and
 * applies optional quota/rate limits when the corresponding env vars are set:
 *
 *   FORGE_GATEWAY_URL      (client side)      default http://localhost:8787
 *   GATEWAY_TOKEN          auth mode bearer
 *   GATEWAY_QUOTA_DB       SQLite path for quota persistence
 *   GATEWAY_DAILY_TOKEN_CAP   daily token cap per IP key
 *   GATEWAY_DAILY_COST_CAP    optional daily cost cap in USD
 *   GATEWAY_RATE_LIMIT        requests/minute per IP (default 60)
 */
export function main(): void {
  const args = process.argv.slice(2)
  const portEnv = Number(process.env.PORT)
  const port = Number(argValue(args, '--port') ?? '') || portEnv || DEFAULT_PORT
  const hostname = argValue(args, '--hostname') ?? process.env.HOST ?? '0.0.0.0'

  const dailyTokenCap = process.env.GATEWAY_DAILY_TOKEN_CAP
  const dailyCostCapUsd = process.env.GATEWAY_DAILY_COST_CAP
  const rateLimit = process.env.GATEWAY_RATE_LIMIT

  const server = startGateway({
    port,
    hostname,
    usePresets: true,
    limits: {
      quotaDbPath: process.env.GATEWAY_QUOTA_DB,
      dailyTokenCap: dailyTokenCap ? Number(dailyTokenCap) : undefined,
      dailyCostCapUsd: dailyCostCapUsd ? Number(dailyCostCapUsd) : undefined,
      ipRequestsPerMinute: rateLimit ? Number(rateLimit) : undefined,
    },
  })

  console.log(`[forge-gateway] listening on http://${hostname}:${port}`)
  const shutdown = () => {
    server.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()