import { config } from './config'
import { prisma }  from './db'
import { createApp } from './app'
import { patchIndexHtml } from './utils/patchIndexHtml'

async function main(): Promise<void> {
  // 1. Connect to Prisma / SQLite
  try {
    await prisma.$connect()
    console.log('[server] ✅  Database connected (SQLite via Prisma)')
  } catch (err) {
    console.error('[server] ⚠️  Database connection failed')
    console.error('[server]', (err as Error).message)
  }

  // 2. Patch index.html with current backend URL
  console.log(`[server] 🌍  Backend URL: ${config.BACKEND_URL}`)
  patchIndexHtml(true)

  // 3. Start server — bind to 0.0.0.0 so Render can detect the port
  const app = createApp()
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`[server] 🚀  betway-backend running on http://0.0.0.0:${config.PORT}`)
    console.log(`[server] 🌐  Frontend available at https://betclone-2.onrender.com`)
  })
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err)
  process.exit(1)
})
