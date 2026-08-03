/**
 * app.ts
 *
 * Creates and configures the Express application.
 * All API routes are mounted before the static file fallback.
 */

import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { config } from './config'
import { sportsRouter }  from './routes/sports'
import { bettingRouter } from './routes/betting'
import { contentRouter } from './routes/content'
import { authRouter }    from './routes/auth'
import { playerRouter }  from './routes/player'
import { staticRouter }  from './routes/static'
import { adminRouter }   from './routes/admin'
import { adminApiRouter } from './routes/adminApi'
import { createProxy, noUpstreamHandler } from './middleware/proxy'
import { createMediaProxy, serveUploads } from './middleware/mediaCache'

export function createApp(): Application {
  const app = express()

  // ── CORS ──────────────────────────────────────────────────────────────────
  const ALLOWED_HEADERS = [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    // Betway-specific headers sent by the SPA
    'X-BrandId',
    'X-Brand',
    'X-SessionToken',
    'X-Session-Token',
    'X-Platform',
    'X-Country',
    'X-Language',
    'X-CultureCode',
    'X-Locale',
    'X-Currency',
    'X-Channel',
    'X-Device',
    'X-Client-Version',
    'X-Tracking-Id',
    'X-Correlation-Id',
    'X-Request-Id',
  ]

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ALLOWED_HEADERS,
    credentials: false,
  }))

  // Explicit preflight handler — mirrors the cors() config and also echoes
  // back any requested headers the client declares in Access-Control-Request-Headers
  app.options('*', (req: Request, res: Response) => {
    const requestedHeaders = req.headers['access-control-request-headers']
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    // Echo back whatever the client is asking to send, plus our known list
    const headersToAllow = requestedHeaders
      ? [...new Set([...ALLOWED_HEADERS, ...requestedHeaders.split(',').map((h: string) => h.trim())])]
      : ALLOWED_HEADERS
    res.setHeader('Access-Control-Allow-Headers', headersToAllow.join(','))
    res.setHeader('Access-Control-Max-Age', '86400') // cache preflight for 24 h
    res.status(204).end()
  })

  // ── Request logger — catch every inbound request ─────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/uploads') && !req.path.startsWith('/_nuxt')) {
      console.log(`[req] ${req.method} ${req.path}${Object.keys(req.query).length ? '?' + new URLSearchParams(req.query as any).toString() : ''}`)
    }
    next()
  })

  // ── Body parsers ──────────────────────────────────────────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    express.json()(req, _res, (err) => {
      if (err) {
        ;(req as any).body = {}
        ;(req as any).jsonParseError = err.message
      }
      next()
    })
  })
  app.use(express.urlencoded({ extended: true }))

  // ── Admin panel (detached, password-protected) ────────────────────────────
  app.use('/admin', adminRouter)
  app.use('/appsynapse/admin', adminApiRouter)

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/br/_apis/sport',        sportsRouter)
  app.use('/appsynapse/bet-api-sr02', bettingRouter)
  app.use('/cms',                   contentRouter)
  app.use('/appsynapse/auth',       authRouter)
  app.use('/appsynapse/player',     playerRouter)

  // Generic proxies
  app.use('/api',       createProxy({ pathPrefix: '/api',       target: config.API_DOMAIN,        stripPrefix: '/api' }))
  app.use('/apic',      createProxy({ pathPrefix: '/apic',      target: config.APIC_DOMAIN,       stripPrefix: '/apic' }))
  app.use('/casinoapi', createProxy({ pathPrefix: '/casinoapi', target: config.CASINO_API_DOMAIN, stripPrefix: '/casinoapi' }))
  app.use('/signalr',   createProxy({ pathPrefix: '/signalr',   target: config.SIGNALR_DOMAIN,    stripPrefix: '/signalr' }))
  app.use('/promoapi',  createProxy({ pathPrefix: '/promoapi',  target: config.PROMO_API_DOMAIN,  stripPrefix: '/promoapi' }))

  // Locales config — intercept and blank out the mobile-number-used error message
  // so it never appears in the registration form
  app.get('/config/cron/locales/synapse/:lang', async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(
        `https://config.betwayafrica.com/cron/locales/synapse/${req.params.lang}`,
        { signal: AbortSignal.timeout(10_000) }
      )
      if (upstream.ok) {
        const text = await upstream.text()
        // Blank the mobile-number-used translation so the SPA never shows the error
        const patched = text
          .replace(/"mobile-number-used"\s*:\s*"[^"]*"/g, '"mobile-number-used":""')
          .replace(/"mobileNumberUsed"\s*:\s*"[^"]*"/g, '"mobileNumberUsed":""')
          .replace(/"MobileNumberUsed"\s*:\s*"[^"]*"/g, '"MobileNumberUsed":""')
        res.setHeader('Content-Type', 'application/json')
        res.send(patched)
        return
      }
    } catch { /* fall through */ }
    res.json({})
  })

  // Registration config — MUST be before the /config proxy so it intercepts first.
  // Fetches from upstream then strips uniqueness-check fields so mobile/email/username
  // validation always passes locally.
  app.get('/config/cron/registration/synapse/:country', async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(
        `https://config.betwayafrica.com/cron/registration/synapse/${req.params.country}`,
        { signal: AbortSignal.timeout(8_000) }
      )
      if (upstream.ok) {
        const cfg = await upstream.json() as any
        if (cfg?.templateSections) {
          for (const section of cfg.templateSections) {
            for (const field of (section.templateFields ?? [])) {
              // Remove uniqueness check type IDs — the SPA uses templateFieldTypeId
              // 00000000-0000-0000-da7a-000000210005 for text fields that get uniqueness-checked.
              // Changing propertyName won't help; instead blank the uniqueness validator flags.
              field.isUnique = false
              field.uniquenessCheck = false
              field.validationEndpoint = null
              // For MobileNumber specifically, widen the regex to accept any digits
              if (field.propertyName === 'MobileNumber') {
                field.regExpression = '^[0-9]{5,15}$'
              }
            }
          }
        }
        res.json(cfg)
        return
      }
    } catch { /* fall through */ }
    res.json({ templateSections: [] })
  })

  // /config proxy — catches everything else under /config
  app.use('/config',    createProxy({ pathPrefix: '/config',    target: config.CONFIG_DOMAIN,     stripPrefix: '/config' }))
  app.use('/sportsapi/br',           createProxy({ pathPrefix: '/sportsapi/br',           target: config.SPORTS_DOMAIN,  stripPrefix: '/sportsapi/br' }))
  app.use('/appsynapse/universal',   createProxy({ pathPrefix: '/appsynapse/universal',   target: config.API_DOMAIN,          stripPrefix: '/appsynapse/universal' }))
  // Insurance endpoint is geo-restricted upstream — return a valid empty stub
  // so the SPA doesn't crash on 404.
  app.use('/appsynapse/insurance', (_req: Request, res: Response) => {
    res.status(200).json({ enabled: false, products: [], config: {} })
  })
  app.use('/appsynapse/bet-api-sr',  createProxy({ pathPrefix: '/appsynapse/bet-api-sr',  target: config.BETTING_DOMAIN, stripPrefix: '/appsynapse/bet-api-sr' }))
  app.use('/appsynapse/bet-api',     createProxy({ pathPrefix: '/appsynapse/bet-api',     target: config.BETTING_DOMAIN, stripPrefix: '/appsynapse/bet-api' }))
  app.use('/synapse-hub', createProxy({ pathPrefix: '/synapse-hub', target: config.SIGNALR_DOMAIN, stripPrefix: '/synapse-hub' }))
  app.use('/sportsapi',   createProxy({ pathPrefix: '/sportsapi',   target: config.SPORTS_DOMAIN,  stripPrefix: '/sportsapi' }))

  // Media / image proxies (cache-through — downloads and caches to disk + DB)
  app.use('/media',        createMediaProxy('https://media.betwayafrica.com'))
  app.use('/sports-client',createMediaProxy('https://sports-client.betwayafrica.com'))
  app.use('/loyalty',      createMediaProxy('https://loyalty-external.betwayafrica.com'))
  app.use('/influencer',   createMediaProxy('https://influencer-external-api.betwayafrica.com'))
  app.use('/jackpots-za',  createMediaProxy('https://jackpotza.ragingriver.io'))
  app.use('/casino-bonus', createMediaProxy('https://casinobonusing.betwayafrica.com'))

  // Serve locally cached uploads
  app.get('/uploads/:filename', serveUploads)

  app.use('/api', noUpstreamHandler)

  // ── Static SPA files (must be last) ──────────────────────────────────────
  app.use(staticRouter)

  // ── Global error handler ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[error] ${new Date().toISOString()} ${req.method} ${req.path}:`, err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return app
}
