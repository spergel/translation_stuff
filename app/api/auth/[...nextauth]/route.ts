import NextAuth from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { env } from '@/app/lib/firebase-env'

// Add logging for API route
console.log('=== NEXTAUTH API ROUTE LOADED ===');
console.log('Environment check in API route:', {
  hasGoogleClientId: !!env.GOOGLE_CLIENT_ID,
  hasGoogleClientSecret: !!env.GOOGLE_CLIENT_SECRET,
  hasNextAuthSecret: !!env.NEXTAUTH_SECRET,
  hasNextAuthUrl: !!env.NEXTAUTH_URL,
  nextAuthUrl: env.NEXTAUTH_URL,
});

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST } 