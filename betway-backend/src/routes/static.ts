/**
 * static.ts
 *
 * Serves the static Betway Nigeria SPA and CDN/CMS asset folders.
 * On Render: static files are copied into betway-backend/ during build.
 * Locally: static files live in the repo root (parent of betway-backend).
 */

import express, { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'

// compiled: dist/routes/static.js → __dirname = dist/routes
// backendDir = betway-backend/  (dist/routes → ../..)
// repoRoot   = betway-clone/    (dist/routes → ../../..)
const backendDir = path.resolve(__dirname, '../..')
const repoRoot   = path.resolve(__dirname, '../../..')

const ROOT = fs.existsSync(path.join(backendDir, 'www.betway.com.ng'))
  ? backendDir  // Render: files copied here during build
  : repoRoot    // Local: files in repo root

console.log(`[static] Root resolved to: ${ROOT}`)

export const staticRouter: Router = Router()

// ── CDN assets ────────────────────────────────────────────────────────────────
staticRouter.use(
  '/cdn.betwayafrica.com',
  express.static(path.join(ROOT, 'cdn.betwayafrica.com'), { fallthrough: true })
)

// ── CMS / Kentico assets ──────────────────────────────────────────────────────
staticRouter.use(
  '/cms1.betwayafrica.com',
  express.static(path.join(ROOT, 'cms1.betwayafrica.com'), { fallthrough: true })
)

// ── SPA root ──────────────────────────────────────────────────────────────────
const spaRoot = path.join(ROOT, 'www.betway.com.ng')

staticRouter.use('/', express.static(spaRoot, { fallthrough: true, index: 'index.html' }))

// ── SPA fallback — serve index.html for all unmatched GET requests ────────────
staticRouter.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(spaRoot, 'index.html'), (err) => {
    if (err) res.status(404).json({ error: 'Not found' })
  })
})
