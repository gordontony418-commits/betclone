import { PrismaClient } from '@prisma/client'

// Singleton Prisma client — the ONLY database connection in this project.
// No original Betway database connections exist.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
