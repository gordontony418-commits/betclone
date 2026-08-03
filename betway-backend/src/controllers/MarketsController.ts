/**
 * MarketsController.ts
 *
 * Cache-first handlers for market groups and favourite markets.
 * Data is served from Prisma/SQLite when available; upstream on miss.
 * Entity persistence is fire-and-forget.
 */

import { Request, Response } from 'express'
import { prisma } from '../db'
import { config } from '../config'

// ─── Fire-and-forget market entity persistence ───────────────────────────────
export async function persistMarketEntities(payload: any): Promise<void> {
  try {
    const markets: any[]  = payload?.marketsInGroup ?? payload?.markets ?? []
    const outcomes: any[] = payload?.outcomes ?? []
    const prices: any[]   = payload?.prices ?? []

    for (const m of markets) {
      if (!m?.marketId) continue
      await prisma.market.upsert({
        where:  { marketId: m.marketId },
        update: {
          name: m.name ?? '', displayName: m.displayName ?? m.name ?? '',
          subscriptionId: m.subscriptionId ?? null,
          isSuspended: m.isSuspended ?? false,
          isCashOutAllowed: m.isCashOutAllowed ?? false,
          isSquashedMarket: m.isSquashedMarket ?? false,
          shouldDisplay: m.shouldDisplay ?? true,
          originalMarketId: m.originalMarketId ?? null,
          sortIndex: m.sortIndex ?? 0,
        },
        create: {
          marketId: m.marketId,
          eventId:  Number(m.eventId),
          name: m.name ?? '',
          displayName: m.displayName ?? m.name ?? '',
          subscriptionId: m.subscriptionId ?? null,
          isSuspended: m.isSuspended ?? false,
          isCashOutAllowed: m.isCashOutAllowed ?? false,
          isSquashedMarket: m.isSquashedMarket ?? false,
          shouldDisplay: m.shouldDisplay ?? true,
          originalMarketId: m.originalMarketId ?? null,
          sortIndex: m.sortIndex ?? 0,
        },
      })
    }

    for (const o of outcomes) {
      if (!o?.outcomeId) continue
      await prisma.outcome.upsert({
        where:  { outcomeId: o.outcomeId },
        update: { displayName: o.displayName ?? '', sbv: o.sbv ?? null, index: o.index ?? 0, handicap: o.handicap ?? 0, shouldDisplay: o.shouldDisplay ?? true, originalMarketId: o.originalMarketId ?? null },
        create: {
          outcomeId: o.outcomeId,
          marketId:  o.marketId,
          eventId:   Number(o.eventId),
          displayName: o.displayName ?? '',
          sbv: o.sbv ?? null,
          index: o.index ?? 0,
          handicap: o.handicap ?? 0,
          shouldDisplay: o.shouldDisplay ?? true,
          originalMarketId: o.originalMarketId ?? null,
        },
      })
    }

    for (const p of prices) {
      if (!p?.outcomeId) continue
      await prisma.price.upsert({
        where:  { outcomeId: p.outcomeId },
        update: { possibleWinnings: String(p.possibleWinnings ?? '0'), possibleWinningsNum: p.possibleWinningsNum ?? 0, possibleWinningsDen: p.possibleWinningsDen ?? 1 },
        create: {
          outcomeId: p.outcomeId,
          possibleWinnings: String(p.possibleWinnings ?? '0'),
          possibleWinningsNum: p.possibleWinningsNum ?? 0,
          possibleWinningsDen: p.possibleWinningsDen ?? 1,
        },
      })
    }
  } catch (err) {
    console.warn('[MarketsController] persistMarketEntities error (non-blocking):', (err as Error).message)
  }
}

// ─── Upstream fetch helper ────────────────────────────────────────────────────
async function fetchUpstream(url: string): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { ok: false, data: null }
    return { ok: true, data: await res.json() }
  } catch {
    return { ok: false, data: null }
  }
}

// ─── GET /br/_apis/sport/MarketGroupings/MarketGroupNamesAndMarketsForEvent ──
export async function getMarkets(req: Request, res: Response): Promise<void> {
  const eventIdRaw = req.query.eventId as string
  const eventId = Number(eventIdRaw)

  if (!eventId || isNaN(eventId)) {
    res.status(400).json({ error: 'eventId query parameter is required' })
    return
  }

  try {
    // DB first
    const markets = await prisma.market.findMany({ where: { eventId } })
    if (markets.length > 0) {
      const marketIds = markets.map((m) => m.marketId)
      const outcomes  = await prisma.outcome.findMany({ where: { marketId: { in: marketIds } } })
      const outcomeIds = outcomes.map((o) => o.outcomeId)
      const prices    = await prisma.price.findMany({ where: { outcomeId: { in: outcomeIds } } })
      res.json({ marketsInGroup: markets, outcomes, prices })
      return
    }
  } catch (err) {
    console.warn('[MarketsController] DB query failed, falling through to upstream:', (err as Error).message)
  }

  // DB miss — forward upstream
  const queryStr = new URLSearchParams(req.query as Record<string, string>).toString()
  const url = `${config.SPORTS_DOMAIN}/MarketGroupings/MarketGroupNamesAndMarketsForEvent?${queryStr}`
  const result = await fetchUpstream(url)

  if (!result.ok) {
    res.status(503).json({ error: 'Upstream unavailable', cached: false })
    return
  }

  persistMarketEntities(result.data).catch(() => {})
  res.json(result.data)
}

// ─── GET /br/_apis/sport/FeedsMarket ─────────────────────────────────────────
export async function getFavouriteMarkets(req: Request, res: Response): Promise<void> {
  const eventId = Number(req.query.EventId)
  const marketNames: string[] = Array.isArray(req.query.MarketNames)
    ? (req.query.MarketNames as string[])
    : req.query.MarketNames ? [req.query.MarketNames as string] : []

  try {
    // Try DB
    const whereClause = eventId && !isNaN(eventId)
      ? marketNames.length > 0
        ? { eventId, name: { in: marketNames } }
        : { eventId }
      : marketNames.length > 0
        ? { name: { in: marketNames } }
        : undefined

    if (whereClause) {
      const markets = await prisma.market.findMany({ where: whereClause })
      if (markets.length > 0) {
        const outcomes = await prisma.outcome.findMany({ where: { marketId: { in: markets.map(m => m.marketId) } } })
        const prices   = await prisma.price.findMany({ where: { outcomeId: { in: outcomes.map(o => o.outcomeId) } } })
        res.json({ markets, outcomes, prices })
        return
      }
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error', detail: (err as Error).message })
    return
  }

  // DB miss — upstream
  const queryStr = new URLSearchParams(req.query as Record<string, string>).toString()
  const url = `${config.SPORTS_DOMAIN}/FeedsMarket?${queryStr}`
  const result = await fetchUpstream(url)

  if (!result.ok) {
    res.status(503).json({ error: 'Upstream unavailable', cached: false })
    return
  }

  persistMarketEntities(result.data).catch(() => {})
  res.json(result.data)
}
