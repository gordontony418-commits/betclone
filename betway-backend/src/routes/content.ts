/**
 * content.ts — CMS / Kentico router (cache-first)
 * Mounted at /cms
 *
 * The frontend calls two styles of CMS URL:
 *   1. /cms?host=...&route=...&lang=...            (our cache-first handler)
 *   2. /cms/gmapi/Content/cmsget/?host=...&...     (direct Kentico path)
 *
 * For style 2, we override the host to cms1.betwayafrica.com (the SPA sends
 * localhost:4000/cms which the real CMS rejects). We cache the result in
 * CronCache so subsequent requests are served instantly.
 */

import { Router, Request, Response } from 'express'
import { getContent } from '../controllers/ContentController'
import { createProxy } from '../middleware/proxy'
import { prisma } from '../db'
import { config } from '../config'

export const contentRouter: Router = Router()

const CMS_UPSTREAM_HOST = 'cms1.betwayafrica.com'
const CMS_TTL_MS = 600_000  // 10 minutes

// Cache-first for the standard query-param style calls
contentRouter.get('/', getContent)

// ── /cms/gmapi/Content/cmsget/ — cache-first with correct upstream host ──────
contentRouter.get('/gmapi/Content/cmsget/', async (req: Request, res: Response): Promise<void> => {
  const route = (req.query.route as string) ?? ''
  const lang  = (req.query.lang  as string) ?? 'en-US'
  const cacheKey = `cms-gmapi:${route}:${lang}`

  // 1. Fresh cache hit
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (entry && entry.expiresAt > new Date()) {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(entry.data)
      return
    }
  } catch { /* DB unavailable, continue */ }

  // 2. Fetch from upstream — always use real CMS host, not what SPA sends
  const qs = new URLSearchParams({ host: CMS_UPSTREAM_HOST, route, lang }).toString()
  const upstreamUrl = `https://${CMS_UPSTREAM_HOST}/gmapi/Content/cmsget/?${qs}`

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/json' },
    })

    if (upstream.ok) {
      const text = await upstream.text()
      // Cache it
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
  } catch { /* network error — fall through to stale/stub */ }

  // 3. Stale cache fallback
  try {
    const stale = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (stale?.data) {
      res.setHeader('Content-Type', 'application/json')
      res.status(200).send(stale.data)
      return
    }
  } catch { /* DB unavailable */ }

  // 4. Last resort — empty stub so SPA doesn't crash
  res.status(200).json({ content: '' })
})

// ── Any other /cms/* subpath → proxy to real CMS (media-libraries, etc.) ─────
contentRouter.use(
  createProxy({
    pathPrefix:  '/cms',
    target:      config.CMS_DOMAIN,
    stripPrefix: '/cms',
    persist:     false,
  })
)
