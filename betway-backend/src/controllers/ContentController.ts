/**
 * ContentController.ts
 *
 * Cache-first CMS (Kentico) content handler.
 * Cache key: "cms:<host>:<route>:<lang>"
 * Fresh cache TTL: 600 seconds (10 minutes).
 *
 * - Fresh hit → return from DB immediately
 * - Miss → fetch from CMS, store in CronCache, return
 * - Upstream unreachable + stale entry → return stale with HTTP 200
 * - Upstream unreachable + no cache → HTTP 503
 */

import { Request, Response } from 'express'
import { prisma } from '../db'
import { config } from '../config'

const CMS_TTL_MS = 600_000   // 10 minutes

function buildCacheKey(host: string, route: string, lang: string): string {
  return `cms:${host}:${route}:${lang}`
}

async function getFreshCache(cacheKey: string): Promise<string | null> {
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (entry && entry.expiresAt > new Date()) return entry.data
  } catch { /* DB unavailable */ }
  return null
}

async function getStaleCache(cacheKey: string): Promise<string | null> {
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    return entry?.data ?? null
  } catch { return null }
}

async function upsertCache(cacheKey: string, data: unknown): Promise<void> {
  try {
    const now = new Date()
    await prisma.cronCache.upsert({
      where:  { cacheKey },
      update: { data: JSON.stringify(data), expiresAt: new Date(Date.now() + CMS_TTL_MS), fetchedAt: now },
      create: { cacheKey, data: JSON.stringify(data), expiresAt: new Date(Date.now() + CMS_TTL_MS), fetchedAt: now },
    })
  } catch { /* non-critical */ }
}

export async function getContent(req: Request, res: Response): Promise<void> {
  const host  = (req.query.host  as string) ?? ''
  const route = (req.query.route as string) ?? ''
  const lang  = (req.query.lang  as string) ?? 'en'

  const cacheKey = buildCacheKey(host, route, lang)

  // 1. Fresh cache hit
  const cached = await getFreshCache(cacheKey)
  if (cached) {
    res.status(200).json(JSON.parse(cached))
    return
  }

  // 2. Fetch from CMS
  const queryStr = new URLSearchParams({ host, route, lang }).toString()
  const url = `${config.CMS_DOMAIN}?${queryStr}`

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(15_000) })

    if (!upstream.ok) {
      const stale = await getStaleCache(cacheKey)
      if (stale) {
        res.status(200).json(JSON.parse(stale))
      } else {
        res.status(503).json({ error: 'Upstream unavailable' })
      }
      return
    }

    const data = await upstream.json()
    await upsertCache(cacheKey, data)
    res.status(200).json(data)

  } catch {
    // Network / timeout error
    const stale = await getStaleCache(cacheKey)
    if (stale) {
      res.status(200).json(JSON.parse(stale))
    } else {
      res.status(503).json({ error: 'Upstream unavailable' })
    }
  }
}
