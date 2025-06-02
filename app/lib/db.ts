import { PrismaClient } from '../../generated/prisma'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const db = global.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.prisma = db
}

// Helper function to detect .edu emails
export function isEduEmail(email: string): boolean {
  return email.toLowerCase().endsWith('.edu')
}

// Storage limit constants (in bytes)
export const STORAGE_LIMITS = {
  free: 5 * 1024 * 1024 * 1024, // 5GB
  basic: 5 * 1024 * 1024 * 1024, // 5GB
  pro: 25 * 1024 * 1024 * 1024, // 25GB
  enterprise: 50 * 1024 * 1024 * 1024, // 50GB
} as const

// Document count limits
export const DOCUMENT_LIMITS = {
  free: 5,
  basic: 50,
  pro: 500,
  enterprise: -1, // unlimited
} as const

// Helper function to check if user can upload more files
export async function canUserUpload(userId: string, fileSize: number) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      tier: true,
      storageUsedBytes: true,
      documentsCount: true,
    }
  })

  if (!user) return { canUpload: false, reason: 'User not found' }

  const tierKey = user.tier as keyof typeof STORAGE_LIMITS
  const storageLimit = STORAGE_LIMITS[tierKey]
  const documentLimit = DOCUMENT_LIMITS[tierKey]

  // Check storage limit
  if (user.storageUsedBytes + BigInt(fileSize) > storageLimit) {
    return { 
      canUpload: false, 
      reason: `Storage limit exceeded. You have ${Math.round(Number(user.storageUsedBytes) / (1024 * 1024 * 1024) * 100) / 100}GB used of ${storageLimit / (1024 * 1024 * 1024)}GB limit.`
    }
  }

  // Check document count limit (unlimited = -1)
  if (documentLimit !== -1 && user.documentsCount >= documentLimit) {
    return { 
      canUpload: false, 
      reason: `Document limit exceeded. You have ${user.documentsCount} documents of ${documentLimit} allowed.`
    }
  }

  return { canUpload: true }
}

// Helper function to update user storage usage
export async function updateUserStorage(userId: string, bytes: number) {
  await db.user.update({
    where: { id: userId },
    data: {
      storageUsedBytes: {
        increment: bytes
      }
    }
  })
}

// Helper function to update document count
export async function updateUserDocumentCount(userId: string, increment: number = 1) {
  await db.user.update({
    where: { id: userId },
    data: {
      documentsCount: {
        increment
      }
    }
  })
} 