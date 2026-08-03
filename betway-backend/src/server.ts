/**
 * server.ts — Entry point
 *
 * 1. Connect to Prisma (SQLite only — no original Betway DB)
 * 2. Patch index.html to redirect API domains to localhost:4000
 * 3. Start Express
 *
 * If DB connection fails, falls through to live-proxy mode (no caching).
 */

import { config } from './config'
import { prisma }  from './db'
import { createApp } from './app'
import { patchIndexHtml } from './utils/patchIndexHtml'
import { execSync } from 'child_process'

let dbAvailable = true

async function main(): Promise<void> {
  // 1. Run migrations programmatically — works even if CLI env vars aren't set
  try {
    console.log('[server] 🔄  Running database migrations...')
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: config.DATABASE_URL },
      cwd: process.cwd(),
    })
    console.log('[server] ✅  Migrations complete')
  } catch (err) {
    console.warn('[server] ⚠️  Migration warning:', (err as Error).message)
  }
  // 1. Connect to Prisma / SQLite
  try {
    await prisma.$connect()
    console.log('[server] ✅  Database connected (SQLite via Prisma)')
  } catch (err) {
    console.error('[server] ⚠️  Database connection failed — running in live-proxy mode (no caching)')
    console.error('[server]', (err as Error).message)
    dbAvailable = false
  }

  // 2. Patch index.html (force re-patch so Render URL is always current)
  console.log(`[server] 🌍  Backend URL: ${config.BACKEND_URL}`)
  patchIndexHtml(true)

  // 3. Start server
  const app = createApp()
  app.listen(config.PORT, () => {
    console.log(`[server] 🚀  betway-backend running on http://localhost:${config.PORT}`)
    console.log(`[server] 🌐  Frontend available at http://localhost:${config.PORT}`)
    if (!dbAvailable) {
      console.log('[server] ⚠️  Caching disabled — all requests are proxied live')
    }
  })
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})

export { dbAvailable }
