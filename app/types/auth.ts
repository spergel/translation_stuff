import { DefaultSession, DefaultUser } from 'next-auth'
import { JWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      tier: string
      isEduEmail: boolean
      storageUsedBytes: bigint
      documentsCount: number
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    id: string
    tier: string
    isEduEmail: boolean
    storageUsedBytes: bigint
    documentsCount: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string
    tier: string
    isEduEmail: boolean
    storageUsedBytes: bigint
    documentsCount: number
  }
} 