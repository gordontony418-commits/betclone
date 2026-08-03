/**
 * adminApi.ts — JSON admin API
 * Mounted at /appsynapse/admin (see app.ts)
 * Protected by the same admin session cookie as the /admin dashboard.
 * Session store is shared with src/routes/admin.ts.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { sessions } from './admin'
import {
  listUsers,
  getUser,
  resetPassword,
  impersonate,
} from '../controllers/AdminController'

export const adminApiRouter: Router = Router()

function requireAdminJson(req: Request, res: Response, next: NextFunction): void {
  const cookie = req.headers.cookie ?? ''
  const match  = cookie.match(/admin_token=([^;]+)/)
  if (match && sessions.has(match[1])) { next(); return }
  res.status(401).json({ error: 'Unauthorized — log in at /admin first' })
}

adminApiRouter.use(requireAdminJson)

adminApiRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    endpoints: {
      'GET  /appsynapse/admin/users':                         'List all users (incl. plaintext passwords + hashes)',
      'GET  /appsynapse/admin/users/:userId':                 'Get a single user',
      'POST /appsynapse/admin/users/:userId/reset-password':  'Reset password { newPassword }',
      'POST /appsynapse/admin/users/:userId/impersonate':     'Mint an impersonation JWT',
    },
  })
})

adminApiRouter.get('/users', listUsers)
adminApiRouter.get('/users/:userId', getUser)
adminApiRouter.post('/users/:userId/reset-password', resetPassword)
adminApiRouter.post('/users/:userId/impersonate', impersonate)

