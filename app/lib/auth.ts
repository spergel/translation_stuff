import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { db, isEduEmail } from './db'

// Helper function to safely serialize BigInt
export const serializeBigInt = (obj: any): any => {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ))
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        // Check if user email is .edu and upgrade to pro automatically
        if (user.email && isEduEmail(user.email)) {
          // Update user tier to pro if they have .edu email
          await db.user.upsert({
            where: { email: user.email },
            update: { 
              tier: 'pro',
              isEduEmail: true 
            },
            create: {
              email: user.email,
              name: user.name,
              image: user.image,
              tier: 'pro',
              isEduEmail: true,
            },
          })
        }
      }
      return true
    },
    async session({ token, session }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
        
        // Get latest user data including tier
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: { 
            tier: true, 
            isEduEmail: true,
            storageUsedBytes: true,
            documentsCount: true,
          }
        })
        
        if (dbUser) {
          // Safely serialize the user data
          const serializedUser = serializeBigInt(dbUser)
          session.user.tier = serializedUser.tier
          session.user.isEduEmail = serializedUser.isEduEmail
          session.user.storageUsedBytes = serializedUser.storageUsedBytes
          session.user.documentsCount = serializedUser.documentsCount
        }
      }
      return session
    },
    async jwt({ user, token }) {
      if (user) {
        token.sub = user.id
      }
      return token
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
} 