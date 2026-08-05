import { PrismaClient } from '@prisma/client'
import { createClient } from '@libsql/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

function createPrismaClient(): PrismaClient {
  const tursoUrl   = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // Use Turso if credentials are set, otherwise fall back to local SQLite
  if (tursoUrl && tursoToken) {
    const libsql = createClient({ url: tursoUrl, authToken: tursoToken })
    const adapter = new PrismaLibSQL(libsql)
    return new PrismaClient({ adapter, log: ['warn', 'error'] } as any)
  }

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
