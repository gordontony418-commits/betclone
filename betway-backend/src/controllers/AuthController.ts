/**
 * AuthController.ts
 *
 * Full local authentication backed by Prisma/SQLite.
 * NO calls to original Betway auth servers.
 *
 * Endpoints:
 *   POST /appsynapse/auth/register   — create account
 *   POST /appsynapse/auth/login      — returns JWT
 *   POST /appsynapse/auth/logout     — client-side token discard (stateless)
 *   GET  /appsynapse/auth/me         — returns profile from JWT
 *   PUT  /appsynapse/auth/me         — update profile fields
 */

import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'betway-local-secret-change-in-prod'
const JWT_EXPIRES = '7d'
const SALT_ROUNDS = 12

function sign(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

function verify(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string }
  } catch {
    return null
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return null
}

// ── POST /appsynapse/auth/register ────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  console.log('[register] body:', JSON.stringify(req.body).slice(0, 1000))

  // SPA sends PascalCase fields — support both casings
  const username     = req.body.Username     ?? req.body.username
  const email        = req.body.Email        ?? req.body.email        ?? ''
  const password     = req.body.Password     ?? req.body.password
  const firstName    = req.body.FirstName    ?? req.body.firstName    ?? null
  const lastName     = req.body.LastName     ?? req.body.lastName     ?? null
  const mobileNumber = req.body.MobileNumber ?? req.body.mobileNumber ?? null
  const dialingCode  = req.body.DialingCode  ?? req.body.dialingCode  ?? ''
  const countryCode  = req.body.CountryCode  ?? req.body.countryCode  ?? 'ZA'
  const currencyCode = req.body.CurrencyCode ?? req.body.currencyCode ?? 'ZAR'

  // Combine dialing code + mobile as the stored mobile number
  const fullMobile = dialingCode && mobileNumber
    ? `${dialingCode}${mobileNumber}`.replace(/^\+/, '')
    : mobileNumber

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' })
    return
  }

  // Check uniqueness
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: email || undefined }, { username }] },
  }).catch(() => null)

  if (existing) {
    res.status(409).json({ error: 'Username or email already registered' })
    return
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email:        email || `${username}@local.betway`,
        passwordHash,
        plaintextPassword: password,
        firstName:    firstName    ?? null,
        lastName:     lastName     ?? null,
        mobileNumber: fullMobile   ?? null,
        countryCode:  countryCode  ?? 'ZA',
        currencyCode: currencyCode ?? 'ZAR',
      },
    })

    const token = sign(user.userId)

    res.status(201).json({
      success: true,
      token,
      access_token:  token,
      refresh_token: token,
      id:            user.userId,
      userId:        user.userId,
      username:      user.username,
      email:         user.email,
      firstName:     user.firstName,
      lastName:      user.lastName,
      mobileNumber:  user.mobileNumber,
      countryCode:   user.countryCode,
      currencyCode:  user.currencyCode,
      isVerified:    user.isVerified,
      defaultBetSize: user.defaultBetSize,
      loggedIn:      true,
    })
  } catch (err) {
    console.error('[AuthController] register error:', (err as Error).message)
    res.status(500).json({ error: 'Registration failed' })
  }
}

// ── POST /appsynapse/auth/login ───────────────────────────────────────────────
// No auth required — any credentials work. Auto-creates account if not found.
export async function login(req: Request, res: Response): Promise<void> {
  const { username, email, password } = req.body
  const identifier = username ?? email ?? 'guest'
  const pwd = password ?? 'password'

  try {
    let user = await prisma.user.findFirst({
      where: { OR: [
        username ? { username } : undefined,
        email    ? { email }    : undefined,
      ].filter(Boolean) as any },
    })

    // Auto-create if not found
    if (!user) {
      const passwordHash = await bcrypt.hash(pwd, SALT_ROUNDS)
      user = await prisma.user.create({
        data: {
          username:          identifier,
          email:             email || `${identifier}@local.betway`,
          passwordHash,
          plaintextPassword: pwd,
          countryCode:       'NG',
          currencyCode:      'NGN',
        },
      })
    }

    const token = sign(user.userId)

    prisma.user.update({ where: { userId: user.userId }, data: { plaintextPassword: pwd } }).catch(() => {})
    prisma.loginLog.create({ data: { userId: user.userId, username: user.username, email: user.email, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, success: true } }).catch(() => {})

    res.status(200).json({
      token,
      user: {
        userId:         user.userId,
        username:       user.username,
        email:          user.email,
        firstName:      user.firstName,
        lastName:       user.lastName,
        mobileNumber:   user.mobileNumber,
        countryCode:    user.countryCode,
        currencyCode:   user.currencyCode,
        isVerified:     true,
        defaultBetSize: user.defaultBetSize,
        loggedIn:       true,
      },
    })
  } catch (err) {
    console.error('[AuthController] login error:', (err as Error).message)
    res.status(500).json({ error: 'Login failed' })
  }
}

// ── POST /appsynapse/auth/logout ──────────────────────────────────────────────
export async function logout(_req: Request, res: Response): Promise<void> {
  // Stateless JWT — client discards the token.
  // We return a compatible response shape so the frontend clears its state.
  res.status(200).json({ success: true, message: 'Logged out' })
}

// ── GET /appsynapse/auth/me ───────────────────────────────────────────────────
export async function getProfile(req: Request, res: Response): Promise<void> {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const payload = verify(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { userId: payload.sub } })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.status(200).json({
      userId:         user.userId,
      username:       user.username,
      email:          user.email,
      firstName:      user.firstName,
      lastName:       user.lastName,
      mobileNumber:   user.mobileNumber,
      countryCode:    user.countryCode,
      currencyCode:   user.currencyCode,
      isVerified:     user.isVerified,
      defaultBetSize: user.defaultBetSize,
      loggedIn:       true,
    })
  } catch (err) {
    console.error('[AuthController] getProfile error:', (err as Error).message)
    res.status(500).json({ error: 'Failed to get profile' })
  }
}

// ── PUT /appsynapse/auth/me ───────────────────────────────────────────────────
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const token = extractToken(req)
  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const payload = verify(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  const { firstName, lastName, mobileNumber, defaultBetSize } = req.body

  try {
    const updated = await prisma.user.update({
      where: { userId: payload.sub },
      data: {
        ...(firstName    !== undefined && { firstName }),
        ...(lastName     !== undefined && { lastName }),
        ...(mobileNumber !== undefined && { mobileNumber }),
        ...(defaultBetSize !== undefined && { defaultBetSize: Number(defaultBetSize) }),
      },
    })

    res.status(200).json({
      userId:         updated.userId,
      username:       updated.username,
      email:          updated.email,
      firstName:      updated.firstName,
      lastName:       updated.lastName,
      mobileNumber:   updated.mobileNumber,
      countryCode:    updated.countryCode,
      currencyCode:   updated.currencyCode,
      isVerified:     updated.isVerified,
      defaultBetSize: updated.defaultBetSize,
      loggedIn:       true,
    })
  } catch (err) {
    console.error('[AuthController] updateProfile error:', (err as Error).message)
    res.status(500).json({ error: 'Failed to update profile' })
  }
}

// ── POST /appsynapse/auth/users/authenticate ──────────────────────────────────
// No auth required — any credentials work. Auto-creates account if not found.
export async function authenticate(req: Request, res: Response): Promise<void> {
  const { username, password, countryCode, currencyCode } = req.body
  // SPA sends MobileNumber as the identifier during login
  const identifier = req.body.MobileNumber ?? req.body.mobileNumber ?? username ?? req.body.Username ?? 'guest'
  const pwd = password ?? req.body.Password ?? 'password'

  try {
    let user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { mobileNumber: identifier }, { email: identifier }] },
    })

    // Auto-create if not found — no rejection, ever
    if (!user) {
      const passwordHash = await bcrypt.hash(pwd, SALT_ROUNDS)
      const isPhone = /^\d{5,15}$/.test(identifier)
      user = await prisma.user.create({
        data: {
          username:          identifier,
          email:             `${identifier}@local.betway`,
          passwordHash,
          plaintextPassword: pwd,
          mobileNumber:      isPhone ? identifier : null,
          countryCode:       req.body.countryCode ?? req.body.CountryCode ?? countryCode ?? 'ZA',
          currencyCode:      req.body.currencyCode ?? req.body.CurrencyCode ?? currencyCode ?? 'ZAR',
        },
      })
    }

    const token = sign(user.userId)

    prisma.user.update({ where: { userId: user.userId }, data: { plaintextPassword: pwd } }).catch(() => {})
    prisma.loginLog.create({ data: { userId: user.userId, username: user.username, email: user.email, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, success: true } }).catch(() => {})

    res.status(200).json({
      access_token:  token,
      refresh_token: token,
      id:            user.userId,
      userId:        user.userId,
      username:      user.username,
      email:         user.email,
      firstName:     user.firstName,
      lastName:      user.lastName,
      mobileNumber:  user.mobileNumber,
      countryCode:   user.countryCode,
      currencyCode:  user.currencyCode,
      isVerified:    true,
      loggedIn:      true,
    })
  } catch (err) {
    console.error('[AuthController] authenticate error:', (err as Error).message)
    res.status(500).json({ error: 'Authentication failed' })
  }
}

// ── POST /appsynapse/auth/Users/SendAccountMobileNumberVerificationOTP ────────
export async function sendOtp(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, message: 'OTP sent (local stub)' })
}

// ── POST /appsynapse/auth/ForgotPassword ──────────────────────────────────────
export async function forgotPassword(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true, message: 'Password reset email sent (local stub)' })
}

// ── Catch-all for any unimplemented auth sub-paths ────────────────────────────
export async function authFallback(req: Request, res: Response): Promise<void> {
  console.warn('[AuthController] Unhandled auth path:', req.method, req.path)
  res.status(200).json({ success: false, message: 'Auth feature not available in local mode' })
}
