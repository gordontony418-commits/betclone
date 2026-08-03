/**
 * proxy.ts
 *
 * Generic proxy middleware factory.
 * Forwards requests to an upstream target, stripping restricted headers,
 * and replaces the `host` header with the upstream's hostname.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express'
import { createProxyMiddleware, Options } from 'http-proxy-middleware'

// Headers we NEVER forward to the upstream
const RESTRICTED_HEADERS = new Set(['host', 'origin', 'referer'])

// Upstream CORS headers we strip from the response so our own cors() middleware stays in control
const UPSTREAM_CORS_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'access-control-max-age',
]

export interface ProxyConfig {
  /** Local path prefix this proxy handles, e.g. '/appsynapse/auth' */
  pathPrefix: string
  /** Full upstream base URL, e.g. 'https://auth.betwayafrica.com' */
  target: string
  /** Optional path segment to strip before forwarding */
  stripPrefix?: string
  /** Whether to write the response body to CronCache (not used here — handled in controllers) */
  persist?: boolean
}

export function createProxy(cfg: ProxyConfig): RequestHandler {
  const targetUrl = new URL(cfg.target)

  const proxyOptions: Options = {
    target: cfg.target,
    changeOrigin: true,
    secure: true,

    // Rewrite path if needed (strip prefix)
    pathRewrite: cfg.stripPrefix
      ? { [`^${escapeRegex(cfg.stripPrefix)}`]: '' }
      : undefined,

    on: {
      // Strip restricted headers before the request goes upstream
      proxyReq: (proxyReq) => {
        RESTRICTED_HEADERS.forEach((h) => proxyReq.removeHeader(h))
        // Replace host with the upstream's host
        proxyReq.setHeader('host', targetUrl.host)
      },

      // Strip upstream CORS headers — our cors() middleware already set them correctly
      proxyRes: (proxyRes, req) => {
        UPSTREAM_CORS_HEADERS.forEach((h) => delete proxyRes.headers[h])
        proxyRes.headers['access-control-allow-origin'] = '*'
        // Log any response that mentions "already in use" to help debug registration
        const origWrite = (proxyRes as any).pipe
        if (process.env.NODE_ENV !== 'production') {
          const chunks: Buffer[] = []
          proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk))
          proxyRes.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8').slice(0, 500)
            if (body.toLowerCase().includes('already') || body.toLowerCase().includes('mobile')) {
              console.log(`[proxy-res] ${(req as any).path} → ${proxyRes.statusCode} : ${body}`)
            }
          })
        }
      },

      error: (err, req, res) => {
        const response = res as Response
        console.error(`[proxy] Error proxying ${(req as Request).path}:`, (err as Error).message)
        if (!response.headersSent) {
          response.status(503).json({ error: 'Upstream unavailable' })
        }
      },
    },
  }

  return createProxyMiddleware(proxyOptions) as unknown as RequestHandler
}

/**
 * Catch-all handler for paths that have no upstream mapping.
 * Mount this AFTER all specific routers.
 */
export function noUpstreamHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({ error: 'No upstream configured for path' })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
