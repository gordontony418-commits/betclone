/**
 * auth.ts — Local auth router (Prisma/JWT — NO Betway auth proxy)
 * Mounted at /appsynapse/auth
 *
 * All auth is handled locally with bcrypt + JWT.
 * Auth tokens and passwords are NEVER forwarded to external services.
 */

import { Router } from 'express'
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  sendOtp,
  forgotPassword,
  authenticate,
  authFallback,
} from '../controllers/AuthController'

export const authRouter: Router = Router()

// ── Registration & Login ──────────────────────────────────────────────────────
authRouter.post('/register',        register)
authRouter.post('/Users/Register',  register)
authRouter.post('/login',           login)
authRouter.post('/Users/Login',     login)
authRouter.post('/Users/Logout',    logout)
authRouter.post('/logout',          logout)

// ── Authenticate — called by SPA after registration, expects access_token/refresh_token/id ──
authRouter.post('/users/authenticate',  authenticate)
authRouter.post('/Users/Authenticate',  authenticate)
authRouter.post('/authenticate',        authenticate)

// ── Profile ───────────────────────────────────────────────────────────────────
authRouter.get('/me',               getProfile)
authRouter.get('/Users/GetProfile', getProfile) // match Betway frontend path
authRouter.put('/me',               updateProfile)
authRouter.put('/Users/UpdateProfile', updateProfile)

// ── Stubs for auth flows the frontend calls ───────────────────────────────────
authRouter.post('/Users/SendAccountMobileNumberVerificationOTP', sendOtp)
authRouter.post('/ForgotPassword',     forgotPassword)
authRouter.post('/Users/ForgotPassword', forgotPassword)

// ── Uniqueness checks — always return "not in use" so registration proceeds ───
// The SPA calls doesUsernameExist and does: .then(e => !e)
// So we must return a FALSY value (false/null/0) — a truthy object like {} would FAIL validation
authRouter.get('/Users/doesUsernameExist',      (_req, res) => res.json(false))
authRouter.get('/Users/doesEmailExist',         (_req, res) => res.json(false))
authRouter.get('/Users/doesMobileNumberExist',  (_req, res) => res.json(false))
authRouter.post('/Users/doesUsernameExist',     (_req, res) => res.json(false))
authRouter.post('/Users/doesEmailExist',        (_req, res) => res.json(false))
authRouter.post('/Users/doesMobileNumberExist', (_req, res) => res.json(false))

// ── Catch-all — return neutral 200 so the SPA doesn't throw ──────────────────
authRouter.all('*', (req, res) => {
  console.log('[auth catch-all]', req.method, req.path, JSON.stringify(req.body ?? {}).slice(0, 200))
  authFallback(req, res)
})
