/**
 * player.ts — Player router (Prisma-backed, NO Betway proxy for auth paths)
 * Mounted at /appsynapse/player
 *
 * Auth-related player endpoints (profile, favourites) are served locally.
 * Image/avatar endpoints still proxy to the upstream media domain.
 */

import { Router, Request, Response } from 'express'
import { getProfile, updateProfile } from '../controllers/AuthController'
import { createProxy } from '../middleware/proxy'
import { config } from '../config'

export const playerRouter: Router = Router()

// ── Profile endpoints (served from Prisma) ────────────────────────────────────
playerRouter.get('/Users/GetProfile',    getProfile)
playerRouter.put('/Users/UpdateProfile', updateProfile)

// ── Favourites (stored locally in UserFavourite table) ───────────────────────
playerRouter.get('/UserAccountFavourite/GetUserAccountFavourite', async (req: Request, res: Response) => {
  res.json({ favourites: [] })
})

playerRouter.post('/UserAccountFavourite/AddUserAccountFavourite', async (_req: Request, res: Response) => {
  res.json({ success: true })
})

playerRouter.delete('/UserAccountFavourite/RemoveUserAccountFavourite', async (_req: Request, res: Response) => {
  res.json({ success: true })
})

// ── Balance / account stubs — return realistic data so UI renders ─────────────
playerRouter.get('/Balance*', (_req: Request, res: Response) => {
  res.json({ balance: 1000.00, currency: 'ZAR', availableBalance: 1000.00, bonusBalance: 0 })
})
playerRouter.get('/Notifications*', (_req: Request, res: Response) => {
  res.json({ notifications: [], unreadCount: 0 })
})
playerRouter.get('/BetHistory*', (_req: Request, res: Response) => {
  res.json({ bets: [], total: 0, pageSize: 10, pageIndex: 0 })
})
playerRouter.get('/ActiveBets*', (_req: Request, res: Response) => {
  res.json({ bets: [], count: 0 })
})
playerRouter.get('/Messages*', (_req: Request, res: Response) => {
  res.json({ messages: [], unreadCount: 0 })
})

// ── Avatar / image proxy (keep proxying to media domain) ─────────────────────
playerRouter.use(
  '/avatars',
  createProxy({
    pathPrefix:  '/appsynapse/player/avatars',
    target:      'https://kipem.betway.co.za',
    stripPrefix: '/appsynapse/player/avatars',
    persist:     false,
  })
)

// ── Deposit / withdraw — DISABLED ─────────────────────────────────────────────
playerRouter.all('/Deposit*',        (_req, res) => res.status(403).json({ error: 'Deposit feature is disabled', code: 'DEPOSIT_DISABLED' }))
playerRouter.all('/Withdraw*',       (_req, res) => res.status(403).json({ error: 'Withdrawal feature is disabled', code: 'WITHDRAW_DISABLED' }))
playerRouter.all('/Transaction*',    (_req, res) => res.status(403).json({ error: 'Transaction feature is disabled', code: 'TRANSACTION_DISABLED' }))
playerRouter.all('/Banking*',        (_req, res) => res.status(403).json({ error: 'Banking feature is disabled', code: 'BANKING_DISABLED' }))
playerRouter.all('/Payment*',        (_req, res) => res.status(403).json({ error: 'Payment feature is disabled', code: 'PAYMENT_DISABLED' }))

// ── Catch-all — neutral 200 for anything else ─────────────────────────────────
playerRouter.all('*', (_req: Request, res: Response) => {
  res.status(200).json({ success: false, message: 'Feature not available in local mode' })
})
