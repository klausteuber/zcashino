import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

// Prevent multiple instances during development hot reload
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Get database URL with proper path resolution
function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL
  if (envUrl) {
    // libSQL resolves file URLs itself. Constructing the absolute URL as a
    // string avoids handing a runtime-controlled path to the bundler's file
    // tracer, which would otherwise copy the entire project into standalone.
    if (envUrl.startsWith('file:./') || envUrl.startsWith('file:prisma/')) {
      const projectRoot = process.cwd().replace(/\/+$/, '')
      const relativePath = envUrl.slice('file:'.length).replace(/^\.\//, '')
      return `file:${projectRoot}/${relativePath}`
    }
    return envUrl
  }
  // Default path
  return `file:${process.cwd().replace(/\/+$/, '')}/prisma/dev.db`
}

// Prisma 7 requires adapter-based connection with config
// Supports both local SQLite (file:) and Turso (libsql://) URLs
const dbUrl = getDatabaseUrl()
const adapter = new PrismaLibSql({
  url: dbUrl,
  ...(process.env.TURSO_AUTH_TOKEN && { authToken: process.env.TURSO_AUTH_TOKEN }),
})

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
