import { PrismaClient } from '@prisma/client'

function createPrismaClient(): PrismaClient {
  // Try Turso first if credentials are available
  const tursoUrl   = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      // Dynamic import to avoid crash if adapter not installed
      const { createClient }    = require('@libsql/client')
      const { PrismaLibSQL }    = require('@prisma/adapter-libsql')
      const libsql = createClient({ url: tursoUrl, authToken: tursoToken })
      const adapter = new PrismaLibSQL(libsql)
      console.log('[db] ☁️  Using Turso cloud database')
      return new PrismaClient({ adapter, log: ['warn', 'error'] } as any)
    } catch (err) {
      console.warn('[db] ⚠️  Turso connection failed, falling back to SQLite:', (err as Error).message)
    }
  }

  // Fall back to local SQLite
  console.log('[db] 💾  Using local SQLite database')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
