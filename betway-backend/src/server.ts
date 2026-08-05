import { config } from './config'
import { prisma }  from './db'
import { createApp } from './app'
import { patchIndexHtml } from './utils/patchIndexHtml'
import { execSync } from 'child_process'

async function main(): Promise<void> {
  // Run migrations — skip if using Turso (cloud DB handles schema via push)
  if (!process.env.TURSO_DATABASE_URL) {
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: config.DATABASE_URL },
        cwd: process.cwd(),
      })
      console.log('[server] ✅  Migrations complete')
    } catch (err) {
      console.warn('[server] ⚠️  Migration warning (non-fatal):', (err as Error).message.split('\n')[0])
    }
  } else {
    console.log('[server] ☁️  Using Turso cloud database — skipping local migrations')
  }
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

  // 3. Fix any users with "undefined" prefix in username
  try {
    const badUsers = await prisma.user.findMany({
      where: { username: { startsWith: 'undefined' } }
    })
    for (const u of badUsers) {
      const cleanUsername = u.username.replace(/^undefined/, '')
      const cleanEmail = u.email.replace(/^undefined/, '')
      await prisma.user.update({
        where: { userId: u.userId },
        data: { 
          username: cleanUsername || u.mobileNumber || u.userId,
          email: cleanEmail.includes('@') ? cleanEmail : `${cleanUsername}@local.betway`,
        }
      })
      console.log(`[server] 🔧  Fixed username: ${u.username} → ${cleanUsername}`)
    }
    if (badUsers.length) console.log(`[server] ✅  Fixed ${badUsers.length} bad username(s)`)
  } catch { /* non-critical */ }

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
