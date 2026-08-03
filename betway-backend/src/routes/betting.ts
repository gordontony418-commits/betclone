/**
 * betting.ts — Betting router (always live-proxied, never cached)
 * Mounted at /appsynapse/bet-api-sr02
 */

import { Router } from 'express'
import { buildBet, placeBet, getOpenBets, cashOut } from '../controllers/BettingController'
import { Request, Response } from 'express'

export const bettingRouter: Router = Router()

// ── Deposit / Withdraw — DISABLED ─────────────────────────────────────────────
bettingRouter.all('/Deposit*',     (_req: Request, res: Response) => res.status(403).json({ error: 'Deposit feature is disabled', code: 'DEPOSIT_DISABLED' }))
bettingRouter.all('/Withdraw*',    (_req: Request, res: Response) => res.status(403).json({ error: 'Withdrawal feature is disabled', code: 'WITHDRAW_DISABLED' }))
bettingRouter.all('/Transaction*', (_req: Request, res: Response) => res.status(403).json({ error: 'Transaction feature is disabled', code: 'TRANSACTION_DISABLED' }))
bettingRouter.all('/Banking*',     (_req: Request, res: Response) => res.status(403).json({ error: 'Banking feature is disabled', code: 'BANKING_DISABLED' }))
bettingRouter.all('/Payment*',     (_req: Request, res: Response) => res.status(403).json({ error: 'Payment feature is disabled', code: 'PAYMENT_DISABLED' }))

// ── Betting (always live) ─────────────────────────────────────────────────────
bettingRouter.post('/Betting/Build',   buildBet)
bettingRouter.post('/Betting/Place',   placeBet)
bettingRouter.get('/Betting/OpenBets', getOpenBets)
bettingRouter.post('/Betting/CashOut', cashOut)
