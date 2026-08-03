/**
 * BettingController.ts
 *
 * All betting endpoints are ALWAYS live-proxied.
 * No DB reads or writes occur in this controller.
 * Auth headers are preserved and forwarded as-is.
 */

import { Request, Response } from 'express'
import { config } from '../config'

const RESTRICTED_HEADERS = new Set(['host', 'connection', 'transfer-encoding', 'keep-alive'])

async function forwardToBetting(req: Request, res: Response, path: string): Promise<void> {
  const targetUrl = `${config.BETTING_DOMAIN}${path}`

  // Build headers — preserve all except restricted hop-by-hop headers
  const forwardHeaders: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.headers)) {
    if (!RESTRICTED_HEADERS.has(key.toLowerCase()) && typeof val === 'string') {
      forwardHeaders[key] = val
    }
  }
  // Replace host with upstream's host
  forwardHeaders['host'] = new URL(config.BETTING_DOMAIN).host

  const fetchOptions: RequestInit = {
    method:  req.method,
    headers: forwardHeaders,
    signal:  AbortSignal.timeout(30_000),
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = JSON.stringify(req.body)
    forwardHeaders['content-type'] = 'application/json'
  }

  try {
    const upstream = await fetch(targetUrl, fetchOptions)

    // Relay status
    res.status(upstream.status)

    // Relay safe response headers
    upstream.headers.forEach((val, key) => {
      if (!RESTRICTED_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, val)
      }
    })

    const body = await upstream.text()
    res.send(body)
  } catch (err) {
    console.error(`[BettingController] upstream error for ${path}:`, (err as Error).message)
    if (!res.headersSent) {
      res.status(503).json({ error: 'Upstream unavailable' })
    }
  }
}

export async function buildBet(req: Request, res: Response): Promise<void> {
  await forwardToBetting(req, res, '/Betting/Build')
}

export async function placeBet(req: Request, res: Response): Promise<void> {
  await forwardToBetting(req, res, '/Betting/Place')
}

export async function getOpenBets(req: Request, res: Response): Promise<void> {
  await forwardToBetting(req, res, '/Betting/OpenBets')
}

export async function cashOut(req: Request, res: Response): Promise<void> {
  await forwardToBetting(req, res, '/Betting/CashOut')
}
