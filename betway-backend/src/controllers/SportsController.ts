/**
 * SportsController.ts
 *
 * Cache-first handlers for sports/esports cron feeds.
 * Cache TTL: 300 seconds (5 minutes).
 * Entity persistence is fire-and-forget — never blocks the HTTP response.
 */

import { Request, Response } from 'express'
import { prisma } from '../db'
import { config } from '../config'

const SPORTS_TTL_MS = 300_000   // 5 minutes
const ESPORTS_TTL_MS = 300_000

// ─── Helper: fetch upstream with a timeout ───────────────────────────────────
async function fetchUpstream(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, status: res.status, data: null }
    const data = await res.json()
    return { ok: true, status: res.status, data }
  } catch {
    clearTimeout(timer)
    return { ok: false, status: 503, data: null }
  }
}

// ─── Cache helper ────────────────────────────────────────────────────────────
async function getFreshCache(cacheKey: string): Promise<string | null> {
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    if (entry && entry.expiresAt > new Date()) {
      return entry.data
    }
  } catch { /* DB unavailable — fall through */ }
  return null
}

async function getStaleCache(cacheKey: string): Promise<string | null> {
  try {
    const entry = await prisma.cronCache.findUnique({ where: { cacheKey } })
    return entry?.data ?? null
  } catch { return null }
}

async function upsertCache(cacheKey: string, data: unknown, ttlMs: number): Promise<void> {
  try {
    const now = new Date()
    await prisma.cronCache.upsert({
      where:  { cacheKey },
      update: { data: JSON.stringify(data), expiresAt: new Date(Date.now() + ttlMs), fetchedAt: now },
      create: { cacheKey, data: JSON.stringify(data), expiresAt: new Date(Date.now() + ttlMs), fetchedAt: now },
    })
  } catch { /* non-critical */ }
}

// ─── Fire-and-forget entity persistence ──────────────────────────────────────
async function persistSportEntities(payload: any): Promise<void> {
  try {
    const sports: any[] = payload?.sports ?? []
    for (const sport of sports) {
      if (!sport?.sportId) continue
      await prisma.sport.upsert({
        where:  { sportId: sport.sportId },
        update: { name: sport.name ?? '', alias: sport.alias ?? sport.sportId, sortIndex: sport.sortIndex ?? 0, isEsport: sport.isEsport ?? false },
        create: { sportId: sport.sportId, name: sport.name ?? '', alias: sport.alias ?? sport.sportId, sortIndex: sport.sortIndex ?? 0, isEsport: sport.isEsport ?? false },
      })
      for (const region of sport.regions ?? []) {
        if (!region?.regionId) continue
        await prisma.region.upsert({
          where:  { regionId: region.regionId },
          update: { name: region.name ?? '', defaultName: region.defaultName ?? '', sortIndex: region.sortIndex ?? 999 },
          create: { regionId: region.regionId, sportId: sport.sportId, name: region.name ?? '', defaultName: region.defaultName ?? '', sortIndex: region.sortIndex ?? 999 },
        })
        for (const league of region.leagues ?? []) {
          if (!league?.leagueId) continue
          await prisma.league.upsert({
            where:  { leagueId: league.leagueId },
            update: { name: league.name ?? '', defaultName: league.defaultName ?? '', friendlyName: league.friendlyName, sortIndex: league.sortIndex ?? 0, shouldDisplay: league.shouldDisplay ?? true },
            create: { leagueId: league.leagueId, regionId: region.regionId, sportId: sport.sportId, name: league.name ?? '', defaultName: league.defaultName ?? '', friendlyName: league.friendlyName, sortIndex: league.sortIndex ?? 0, shouldDisplay: league.shouldDisplay ?? true },
          })
        }
      }
    }
    for (const ev of payload?.events ?? []) {
      if (!ev?.eventId) continue
      await prisma.event.upsert({
        where:  { eventId: Number(ev.eventId) },
        update: { name: ev.name ?? '', startTime: new Date(ev.startTime), isLive: ev.isLive ?? false, shouldDisplay: ev.shouldDisplay ?? true, isProducerActive: ev.isProducerActive ?? true },
        create: {
          eventId: Number(ev.eventId),
          sportId: ev.sportId ?? '',
          leagueId: ev.leagueId ?? null,
          name: ev.name ?? '',
          startTime: new Date(ev.startTime ?? Date.now()),
          homeTeam: ev.homeTeam ?? null,
          awayTeam: ev.awayTeam ?? null,
          isLive: ev.isLive ?? false,
          isTwoUpEnabled: ev.isTwoUpEnabled ?? false,
          shouldDisplay: ev.shouldDisplay ?? true,
          isProducerActive: ev.isProducerActive ?? true,
        },
      })
    }
  } catch (err) {
    console.warn('[SportsController] persistSportEntities error (non-blocking):', (err as Error).message)
  }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

export async function getSports(req: Request, res: Response): Promise<void> {
  const { brand, locale } = req.params
  const cacheKey = `sports:${brand}:${locale}`

  // 1. Try fresh cache
  const cached = await getFreshCache(cacheKey)
  if (cached) {
    res.json(JSON.parse(cached))
    return
  }

  // 2. Fetch upstream — try config.betwayafrica.com first (accessible), fallback to sports domain
  const url = `https://config.betwayafrica.com/cron/sports/${brand}/${locale}`
  const result = await fetchUpstream(url)

  if (!result.ok) {
    // 3. Return stale cache or local DB data
    const stale = await getStaleCache(cacheKey)
    if (stale) {
      res.json(JSON.parse(stale))
      return
    }
    // Fall back to local DB — build sports response from seeded data
    try {
      const sports = await prisma.sport.findMany({
        where: { isEsport: false },
        orderBy: { sortIndex: 'asc' },
        include: {
          regions: {
            orderBy: { sortIndex: 'asc' },
            include: {
              leagues: {
                orderBy: { sortIndex: 'asc' },
              },
            },
          },
        },
      })
      const events = await prisma.event.findMany({
        where: { shouldDisplay: true, isProducerActive: true },
        orderBy: { startTime: 'asc' },
        take: 50,
      })
      const localData = {
        sports: sports.map(s => ({
          sportId: s.sportId,
          name: s.name,
          alias: s.alias,
          sortIndex: s.sortIndex,
          regions: s.regions.map(r => ({
            regionId: r.regionId,
            name: r.name,
            defaultName: r.defaultName,
            sortIndex: r.sortIndex,
            leagues: r.leagues.map(l => ({
              leagueId: l.leagueId,
              name: l.name,
              defaultName: l.defaultName,
              friendlyName: l.friendlyName,
              sortIndex: l.sortIndex,
            })),
          })),
        })),
        events: events.map(e => ({
          eventId: e.eventId,
          sportId: e.sportId,
          leagueId: e.leagueId,
          name: e.name,
          homeTeam: e.homeTeam,
          awayTeam: e.awayTeam,
          startTime: e.startTime.toISOString(),
          isLive: e.isLive,
        })),
      }
      res.json(localData)
    } catch {
      res.status(503).json({ error: 'Upstream unavailable', cached: false })
    }
    return
  }

  // 4. Persist cache (await) and entities (fire-and-forget)
  await upsertCache(cacheKey, result.data, SPORTS_TTL_MS)
  persistSportEntities(result.data).catch(() => {})

  res.json(result.data)
}

export async function getEsports(req: Request, res: Response): Promise<void> {
  const { brand, locale } = req.params
  const cacheKey = `esports:${brand}:${locale}`

  const cached = await getFreshCache(cacheKey)
  if (cached) {
    res.json(JSON.parse(cached))
    return
  }

  const url = `https://config.betwayafrica.com/cron/esports/${brand}/${locale}`
  const result = await fetchUpstream(url)

  if (!result.ok) {
    const stale = await getStaleCache(cacheKey)
    if (stale) {
      res.json(JSON.parse(stale))
    } else {
      res.status(503).json({ error: 'Upstream unavailable', cached: false })
    }
    return
  }

  await upsertCache(cacheKey, result.data, ESPORTS_TTL_MS)
  persistSportEntities(result.data).catch(() => {})

  res.json(result.data)
}
