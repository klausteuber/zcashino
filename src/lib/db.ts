import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import path from 'path'

// Prevent multiple instances during development hot reload
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Get database URL with proper path resolution
function getDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL
  if (envUrl) {
    // If it's a relative file path, resolve it to absolute
    if (envUrl.startsWith('file:./') || envUrl.startsWith('file:prisma/')) {
      const relativePath = envUrl.replace('file:', '')
      const absolutePath = path.resolve(process.cwd(), relativePath)
      return `file:${absolutePath}`
    }
    return envUrl
  }
  // Default path
  const defaultPath = path.resolve(process.cwd(), 'prisma', 'dev.db')
  return `file:${defaultPath}`
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
