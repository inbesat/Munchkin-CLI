import { cors } from 'hono/cors'

export function createCorsMiddleware(allowedOrigins: string[] = ['*']) {
  const allowAll = allowedOrigins.includes('*')
  return cors({
    origin: (origin) => {
      if (allowAll) return '*'
      if (origin && allowedOrigins.includes(origin)) return origin
      return ''
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
    credentials: !allowAll,
  })
}
