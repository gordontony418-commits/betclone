/**
 * static.ts
 *
 * Serves the static Betway Nigeria SPA and CDN/CMS asset folders.
 * Mount order matters:
 *   1. /cdn.betwayafrica.com/ → cdn.betwayafrica.com/
 *   2. /cms1.betwayafrica.com/ → cms1.betwayafrica.com/
 *   3. /  → www.betway.com.ng/   (catch-all SPA)
 */

import express, { Router, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'

// Resolve the monorepo root — works for both local (dist/routes → ../../..)
// and Render (rootDir: betway-backend, so static folders are siblings at ../)
function findRoot(): string {
  // Try going up from __dirname until we find www.betway.com.ng
  const candidates = [
    path.resolve(__dirname, '../../..'),   // local: src/routes/static.ts → betway-clone/
    path.resolve(__dirname, '../..'),      // Render dist/routes → betway-backend/../ = betway-clone/
    path.resolve(__dirname, '..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'www.betway.com.ng'))) {
      console.log(`[static] Root resolved to: ${candidate}`)
      return candidate
    }
  }
  // fallback
  console.warn('[static] Could not find www.betway.com.ng — using default path')
  return path.resolve(__dirname, '../../..')
}

const ROOT = findRoot()

export const staticRouter: Router = Router()

// ── CDN assets ───────────────────────────────────────────────────────────────
staticRouter.use(
  '/cdn.betwayafrica.com',
  express.static(path.join(ROOT, 'cdn.betwayafrica.com'), {
    fallthrough: true,
    setHeaders: setContentType,
  })
)

// ── CMS / Kentico assets ─────────────────────────────────────────────────────
staticRouter.use(
  '/cms1.betwayafrica.com',
  express.static(path.join(ROOT, 'cms1.betwayafrica.com'), {
    fallthrough: true,
    setHeaders: setContentType,
  })
)

// ── SPA root ─────────────────────────────────────────────────────────────────
const spaRoot = path.join(ROOT, 'www.betway.com.ng')

staticRouter.use(
  '/',
  express.static(spaRoot, {
    fallthrough: true,
    index: 'index.html',
    setHeaders: setContentType,
  })
)

// ── SPA fallback — serve index.html for all unmatched GET requests ───────────
staticRouter.get('*', (req: Request, res: Response) => {
  const indexPath = path.join(spaRoot, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Not found' })
    }
  })
})

/** Let express.static derive Content-Type from file extension */
function setContentType(_res: express.Response, _filePath: string): void {
  // express.static does this automatically — no manual override needed
}
