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

  // ── Casino widget (rowapi) — proxy and return empty stubs ────────────────
  app.get('/casinowidget/api/v1/Banners/*', (_req: Request, res: Response) => { res.json([]) })
  app.use('/casinowidget', createProxy({ pathPrefix: '/casinowidget', target: 'https://rowapic.gmgamingsystems.com', stripPrefix: '/casinowidget' }))

  // Generic proxies
  app.use('/api',       createProxy({ pathPrefix: '/api',       target: config.API_DOMAIN,        stripPrefix: '/api' }))
  // /apic proxy is AFTER our specific stubs below
  app.use('/casinoapi', createProxy({ pathPrefix: '/casinoapi', target: config.CASINO_API_DOMAIN, stripPrefix: '/casinoapi' }))
  app.use('/signalr',   createProxy({ pathPrefix: '/signalr',   target: config.SIGNALR_DOMAIN,    stripPrefix: '/signalr' }))
  app.use('/promoapi',  createProxy({ pathPrefix: '/promoapi',  target: config.PROMO_API_DOMAIN,  stripPrefix: '/promoapi' }))

  // ── APIC stubs — must come BEFORE the /apic proxy ────────────────────────
  app.get('/apic/v1/HomePage/HeaderTiles/:country', (_req: Request, res: Response) => {
    res.json([
      { name: 'sport',         order: 1,  pageRoute: '/sport',              imageGradient: '#00CF00,#018201' },
      { name: 'live',          order: 2,  pageRoute: '/sport/live',         imageGradient: '#FF4500,#B22222' },
      { name: 'casino',        order: 3,  pageRoute: '/lobby/casino-games', imageGradient: '#0066FF,#003D99' },
      { name: 'aviator',       order: 4,  pageRoute: '/aviator',            imageGradient: '#FF6600,#CC4400' },
      { name: 'live casino',   order: 5,  pageRoute: '/lobby/live-casino',  imageGradient: '#8B0000,#4B0000' },
      { name: 'lucky numbers', order: 6,  pageRoute: '/lucky-numbers',      imageGradient: '#FFD700,#FFA500' },
      { name: 'betgames',      order: 7,  pageRoute: '/betgames',           imageGradient: '#6A0DAD,#3D0066' },
      { name: 'esports',       order: 8,  pageRoute: '/esports',            imageGradient: '#00BFFF,#0080FF' },
      { name: 'virtuals',      order: 9,  pageRoute: '/virtuals',           imageGradient: '#32CD32,#006400' },
      { name: 'promotions',    order: 10, pageRoute: '/promotions',         imageGradient: '#FFBE0C,#C28100' },
    ])
  })
  app.get('/apic/v1/Toast/:country', (_req: Request, res: Response) => { res.json([]) })
  app.get('/apic/v1/Toast', (_req: Request, res: Response) => { res.json([]) })
  app.get('/apic/v1/Promotions*', (_req: Request, res: Response) => { res.json([]) })
  app.get('/apic/v1/Jackpots*', (_req: Request, res: Response) => { res.json({ jackpots: [] }) })
  app.get('/apic/v1/WinBoost*', (_req: Request, res: Response) => { res.json({ WinBoostOffers: [] }) })
  // Fallback apic proxy
  app.use('/apic', createProxy({ pathPrefix: '/apic', target: config.APIC_DOMAIN, stripPrefix: '/apic' }))

  // ── Critical config stubs — must come BEFORE the /config proxy ──────────────
  // appsettings — always return ZA config regardless of country param
  // (hostname betclone-2.onrender.com ends in 'om' → detected as OM, so we ignore the param)
  app.get('/config/cron/appsettings/synapse/:country', (_req: Request, res: Response) => {
    res.json({
      countries: [{
        countryCode: 'ZA',
        countryIsoTwo: 'ZA',
        countryName: 'South Africa',
        twitterHandle: 'betway',
        facebookUrl: 'https://www.facebook.com/betway',
        instagramUrl: 'https://www.instagram.com/betway_sa',
        appAvailable: true,
        androidAppUrl: '',
        iosAppUrl: '',
        huaweiAppUrl: '',
        minDepositAmount: 10,
        maxDepositAmount: 50000,
        defaultBetSize: 10,
        taxRate: 0,
        supportEmail: 'support@betway.co.za',
        supportPhone: '',
        liveChatEnabled: true,
        registrationEnabled: true,
        loginEnabled: true,
        depositEnabled: false,
        withdrawEnabled: false,
        kycEnabled: false,
        responsibleGamblingUrl: 'https://responsiblegambling.org.za/',
        termsUrl: '/terms-and-conditions',
        privacyUrl: '/privacy-policy',
        brandId: 'bd66ebe1-080b-4455-9094-bf0464d4adbf',
        regionCode: 'ZA',
        // build v4
      }],
      devConfig: { appAvailable: true, maintenanceMode: false },
      appSetting: {
        CountryCode: 'ZA',
        BrandId: 'bd66ebe1-080b-4455-9094-bf0464d4adbf',
        CurrencySymbol: 'R',
        MinimumBetAmount: 1,
        MaximumPriceDecimal: 10000,
        boostedOddsPercentage: 0,
        JackpotSettings: null,
        ResponsibleGamingSwitches: null,
        TaxSettings: null,
        FreeBetPayoutLimits: [],
        PayoutLimits: [],
        FeatureFlagsList: {
          IsHomePageEnabled: true,
          IsLoyaltyEnabled: false,
          IsCustomHomePageEnabled: false,
          IsAppsFlyerSmartBannerEnabled: false,
          IsSumSubPasswordReset: false,
          IsBetwayInsuranceEnabled: false,
          IsTaxHidden: false,
          ShowCountryFlag: false,
          IsStreamingEnabled: false,
        },
      },
      homepage: {
        headerTiles: [
          { name: 'home',         order: 0,  pageRoute: '/',                   icon: 'home',         imageGradient: '#1DB954,#148A3A' },
          { name: 'sport',        order: 1,  pageRoute: '/sport',              icon: 'soccer',       imageGradient: '#00CF00,#018201' },
          { name: 'live',         order: 2,  pageRoute: '/sport/live',         icon: 'live',         imageGradient: '#FF4500,#B22222' },
          { name: 'casino',       order: 3,  pageRoute: '/lobby/casino-games', icon: 'casino',       imageGradient: '#0066FF,#003D99' },
          { name: 'aviator',      order: 4,  pageRoute: '/aviator',            icon: 'aviator',      imageGradient: '#FF6600,#CC4400' },
          { name: 'live casino',  order: 5,  pageRoute: '/lobby/live-casino',  icon: 'live-casino',  imageGradient: '#8B0000,#4B0000' },
          { name: 'lucky numbers',order: 6,  pageRoute: '/lucky-numbers',      icon: 'lucky-numbers',imageGradient: '#FFD700,#FFA500' },
          { name: 'betgames',     order: 7,  pageRoute: '/betgames',           icon: 'betgames',     imageGradient: '#6A0DAD,#3D0066' },
          { name: 'esports',      order: 8,  pageRoute: '/esports',            icon: 'esports',      imageGradient: '#00BFFF,#0080FF' },
          { name: 'virtuals',     order: 9,  pageRoute: '/virtuals',           icon: 'virtuals',     imageGradient: '#32CD32,#006400' },
          { name: 'promotions',   order: 10, pageRoute: '/promotions',         icon: 'promotions',   imageGradient: '#FFBE0C,#C28100' },
        ],
      },
      cultures: [{ cultureCode: 'en-US', locale: 'en-US', language: 'English', isDefault: true }],
      currencies: [{ currencyCode: 'ZAR', currencySymbol: 'R', isDefault: true }],
      pageLinks: [],
      features: {},
    })
  })

  // redirects stub
  app.get('/config/cron/redirects/synapse/:country', (_req: Request, res: Response) => {
    res.json({ redirects: [] })
  })

  // ── Additional config stubs ────────────────────────────────────────────────
  app.get('/config/cron/sports/:country/:lang', async (req: Request, res: Response) => {
    try {
      const r = await fetch(`https://config.betwayafrica.com/cron/sports/${req.params.country}/${req.params.lang}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) { res.setHeader('Content-Type', 'application/json'); res.send(await r.text()); return }
    } catch {}
    res.json({ sports: [] })
  })
  app.get('/config/cron/newsboxitems/:country', async (req: Request, res: Response) => {
    try {
      const r = await fetch(`https://config.betwayafrica.com/cron/newsboxitems/${req.params.country}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) { res.setHeader('Content-Type', 'application/json'); res.send(await r.text()); return }
    } catch {}
    res.json([])
  })
  app.get('/config/cron/sports-book/market-header-config/:app/:country', async (req: Request, res: Response) => {
    try {
      const r = await fetch(`https://config.betwayafrica.com/cron/sports-book/market-header-config/${req.params.app}/${req.params.country}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) { res.setHeader('Content-Type', 'application/json'); res.send(await r.text()); return }
    } catch {}
    res.json({ sportMarkets: [] })
  })
  app.get('/config/cron/sport-streaming/:country', async (req: Request, res: Response) => {
    try {
      const r = await fetch(`https://config.betwayafrica.com/cron/sport-streaming/${req.params.country}?api-version=2.0`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) { res.setHeader('Content-Type', 'application/json'); res.send(await r.text()); return }
    } catch {}
    res.json({ streamableLeagues: [] })
  })
  app.get('/config/cron/esports/:country/:lang', async (req: Request, res: Response) => {
    try {
      const r = await fetch(`https://config.betwayafrica.com/cron/esports/${req.params.country}/${req.params.lang}`, { signal: AbortSignal.timeout(8000) })
      if (r.ok) { res.setHeader('Content-Type', 'application/json'); res.send(await r.text()); return }
    } catch {}
    res.json({ sports: [] })
  })

  // sitemaps stub v3 — returns real nav items with correct shape for the Nav component
  // Called as /config/cron/sitemaps/synapseV2/{country}/{lang} — country may be "undefined"
  // Nav reads: s.sitemap.filter(e => e.N.top) where N.top = show in top nav
  const SITEMAP_ITEMS = [
    { PN: 'Sport',         RURL: '/sport',              RE: '', A: 'sport',          PG: 'sport',         N: { top: true } },
    { PN: 'Live',          RURL: '/sport/live',         RE: '', A: 'live',           PG: 'live',          N: { top: true } },
    { PN: 'Casino',        RURL: '/lobby/casino-games', RE: '', A: 'casino',         PG: 'casino',        N: { top: true } },
    { PN: 'Aviator',       RURL: '/aviator',            RE: '', A: 'aviator',        PG: 'aviator',       N: { top: true } },
    { PN: 'Live Casino',   RURL: '/lobby/live-casino',  RE: '', A: 'live casino',    PG: 'live-casino',   N: { top: true } },
    { PN: 'Lucky Numbers', RURL: '/lucky-numbers',      RE: '', A: 'lucky-numbers',  PG: 'lucky-numbers', N: { top: true } },
    { PN: 'Betgames',      RURL: '/betgames',           RE: '', A: 'betgames',       PG: 'betgames',      N: { top: true } },
    { PN: 'Esports',       RURL: '/esports',            RE: '', A: 'esports',        PG: 'esports',       N: { top: true } },
    { PN: 'Virtuals',      RURL: '/virtuals',           RE: '', A: 'virtuals',       PG: 'virtuals',      N: { top: true } },
    { PN: 'Promotions',    RURL: '/promotions',         RE: '', A: 'promotions',     PG: 'promotions',    N: { top: true } },
  ]
  app.get('/config/cron/sitemaps/synapseV2/:country/:lang', (_req: Request, res: Response) => { res.json({ siteMap: [{ data: { sitemap: SITEMAP_ITEMS } }] }) })
  app.get('/config/cron/sitemaps/synapseV2/:country',       (_req: Request, res: Response) => { res.json({ siteMap: [{ data: { sitemap: SITEMAP_ITEMS } }] }) })
  app.get('/config/cron/sitemaps',                          (_req: Request, res: Response) => { res.json({ siteMap: [{ data: { sitemap: SITEMAP_ITEMS } }] }) })
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

  // ── Nav product icons — proxy from Kentico CDN ───────────────────────────
  app.get('/icons/productnav/:icon', async (req: Request, res: Response) => {
    const icon = req.params.icon
    const url  = `https://media.betwayafrica.com/medialibraries/content.gmgamingsystems.com/Synapse/icons/productnav/${icon}`
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(8_000) })
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer())
        res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/svg+xml')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.send(buf)
        return
      }
    } catch { /* fall through */ }
    // Return a simple placeholder SVG so no broken icons appear
    res.setHeader('Content-Type', 'image/svg+xml')
    res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#00d4aa"/></svg>')
  })

  // Serve locally cached uploads
  app.get('/uploads/:filename', serveUploads)

  // Tracking scripts — return empty JS so they don't crash
  app.get('/tracking/*', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.send('/* tracking disabled in local mode */')
  })

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
