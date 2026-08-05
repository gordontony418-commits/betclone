/**
 * content.ts — CMS / Kentico router (local-first)
 * Mounted at /cms
 *
 * Serves local JSON files first, falls back to upstream CMS, then stale cache.
 * Local files live at: betway-backend/cms_home.json, cms_footer.json, cms_sponsorship.json
 */

import { Router, Request, Response } from 'express'
import { getContent } from '../controllers/ContentController'
import { createProxy } from '../middleware/proxy'
import { prisma } from '../db'
import { config } from '../config'
import path from 'path'
import fs from 'fs'

export const contentRouter: Router = Router()

const CMS_UPSTREAM_HOST = 'cms1.betwayafrica.com'
const CMS_TTL_MS = 600_000  // 10 minutes

// Find monorepo root
function findRoot(): string {
  const candidates = [
    path.resolve(__dirname, '../../..'),
    path.resolve(__dirname, '../..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'cms_home.json')) || fs.existsSync(path.join(c, 'betway-backend', 'cms_home.json'))) {
      if (fs.existsSync(path.join(c, 'cms_home.json'))) return c
      return path.join(c, 'betway-backend')
    }
  }
  return path.resolve(__dirname, '../..')
}

const LOCAL_CMS_DIR = findRoot()

function getLocalCms(route: string): string | null {
  // Map route patterns to local files
  if (!route || route === 'undefined') return null
  const r = route.toLowerCase()
  if (r.includes('home-page-sponsorship') || r.includes('sponsorship')) {
    const f = path.join(LOCAL_CMS_DIR, 'cms_sponsorship.json')
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  }
  if (r.includes('footer')) {
    const f = path.join(LOCAL_CMS_DIR, 'cms_footer.json')
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  }
  if (r.includes('home')) {
    const f = path.join(LOCAL_CMS_DIR, 'cms_home.json')
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
  }
  return null
}

// Cache-first for the standard query-param style calls
contentRouter.get('/', getContent)

// ── /cms/gmapi/Content/cmsget/ — local-first, then upstream, then stale ──────
contentRouter.get('/gmapi/Content/cmsget/', async (req: Request, res: Response): Promise<void> => {
  // Normalize any country code in the route to ZA — handles TZ, OM, NG etc.
  const rawRoute = (req.query.route as string) ?? ''
  const route = rawRoute === 'undefined' ? '' : rawRoute
    .replace(/\/[A-Z]{2}\//g, '/ZA/')  // replace any 2-letter country code with ZA
  const lang  = (req.query.lang  as string) ?? 'en-US'
  const cacheKey = `cms-gmapi:${route}:${lang}`

  // Skip if route is empty/undefined
  if (!route) {
    res.status(200).json({ content: '' })
    return
  }

  // Use correct upstream host — may be content.betwayafrica.com or cms1.betwayafrica.com
  const reqHost = (req.query.host as string) ?? ''
  const upstreamHost = reqHost.includes('content.betwayafrica.com')
    ? 'content.betwayafrica.com'
    : CMS_UPSTREAM_HOST

  // 1. Serve from local JSON files first (fastest, always works)
  const local = getLocalCms(route)
  if (local) {
    res.setHeader('Content-Type', 'application/json')
    res.status(200).send(local)
    return
  }

  // 2. Fresh cache hit
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (entry && entry.expiresAt > new Date()) {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(entry.data)
      return
    }
  } catch { /* DB unavailable, continue */ }

  // 3. Fetch from upstream — use correct CMS host
  const qs = new URLSearchParams({ host: upstreamHost, route, lang }).toString()
  const upstreamUrl = `https://${upstreamHost}/gmapi/Content/cmsget/?${qs}`

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    })

    if (upstream.ok) {
      const text = await upstream.text()
      try {
        await prisma.cronCache.upsert({
          where:  { cacheKey },
          update: { data: text, expiresAt: new Date(Date.now() + CMS_TTL_MS), fetchedAt: new Date() },
          create: { cacheKey, data: text, expiresAt: new Date(Date.now() + CMS_TTL_MS), fetchedAt: new Date() },
        })
      } catch { /* non-critical */ }
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(text)
      return
    }
  } catch { /* network error — fall through */ }

  // 4. Stale cache fallback
  try {
    const stale = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (stale?.data) {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(stale.data)
      return
    }
  } catch { /* DB unavailable */ }

  // 5. Last resort — empty stub so SPA doesn't crash
  res.status(200).json({ content: '' })
})

// ── Any other /cms/* subpath → proxy to real CMS ─────────────────────────────
contentRouter.use(
  '/medialibraries',
  createProxy({
    pathPrefix:  '/cms/medialibraries',
    target:      'https://cms1.betwayafrica.com',
    stripPrefix: '/cms',
    persist:     false,
  })
)

contentRouter.use(
  createProxy({
    pathPrefix:  '/cms',
    target:      config.CMS_DOMAIN,
    stripPrefix: '/cms',
    persist:     false,
  })
)
