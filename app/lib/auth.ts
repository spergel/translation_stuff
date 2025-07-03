import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { firestoreHelpers } from './firestore-schema'
import { UserTier } from '@/app/types/translation'
import { env } from './firebase-env'

// Helper function to check if email is .edu
function isEduEmail(email: string): boolean {
  return email.endsWith('.edu');
}

// Helper function to safely serialize BigInt
export const serializeBigInt = (obj: any): any => {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ))
}

// Log environment variables (without exposing secrets)
console.log('Auth Environment Check:', {
  hasGoogleClientId: !!env.GOOGLE_CLIENT_ID,
  hasGoogleClientSecret: !!env.GOOGLE_CLIENT_SECRET,
  hasNextAuthSecret: !!env.NEXTAUTH_SECRET,
  hasNextAuthUrl: !!env.NEXTAUTH_URL,
  googleClientIdLength: env.GOOGLE_CLIENT_ID?.length || 0,
  googleClientSecretLength: env.GOOGLE_CLIENT_SECRET?.length || 0,
});

export const authOptions: NextAuthOptions = {
  debug: true, // Enable NextAuth debug mode
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      console.log('=== SIGNIN CALLBACK START ===');
      console.log('SignIn attempt details:', { 
        userEmail: user?.email, 
        userName: user?.name,
        provider: account?.provider,
        accountType: account?.type,
        hasProfile: !!profile,
        hasEmail: !!email,
        hasCredentials: !!credentials
      });
      
      if (account?.provider === 'google' && user.email) {
        console.log('Google provider detected, processing user:', user.email);
        
        // Create or update user in Firestore (this handles both sign-in and sign-up)
        try {
          console.log('Creating/updating user in Firestore:', user.email);
          const userData = {
            email: user.email,
            name: user.name || undefined,
            image: user.image || undefined,
            tier: (isEduEmail(user.email) ? 'pro' : 'free') as UserTier,
            isEduEmail: isEduEmail(user.email),
            storageUsedBytes: 0,
            documentsCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          console.log('User data to save:', userData);
          
          await firestoreHelpers.createUser(userData);
          console.log('Successfully created/updated user in Firestore:', user.email);
          console.log('=== SIGNIN CALLBACK SUCCESS ===');
          return true;
        } catch (error) {
          console.error('Error creating user in Firestore:', error);
          console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
          // Still allow sign-in even if Firestore fails
          console.log('Allowing sign-in despite Firestore error');
          console.log('=== SIGNIN CALLBACK SUCCESS (WITH ERROR) ===');
          return true;
        }
      }
      
      console.log('SignIn rejected: missing provider or email');
      console.log('=== SIGNIN CALLBACK REJECTED ===');
      return false;
    },
    async session({ token, session }) {
      console.log('=== SESSION CALLBACK START ===');
      console.log('Session callback details:', {
        hasToken: !!token,
        hasSession: !!session,
        tokenSub: token.sub,
        sessionUser: session.user ? {
          email: session.user.email,
          name: session.user.name,
          hasImage: !!session.user.image
        } : null
      });
      
      if (token.sub && session.user) {
        session.user.id = token.sub
        console.log('Set user ID in session:', token.sub);
        
        // Get latest user data including tier
        try {
          console.log('Fetching user data from Firestore for:', token.sub);
          const dbUser = await firestoreHelpers.getUser(token.sub);
          if (dbUser) {
            console.log('Found user in Firestore:', {
              email: dbUser.email,
              tier: dbUser.tier,
              isEduEmail: dbUser.isEduEmail,
              storageUsedBytes: dbUser.storageUsedBytes,
              documentsCount: dbUser.documentsCount
            });
            session.user.tier = dbUser.tier;
            session.user.isEduEmail = dbUser.isEduEmail;
            session.user.storageUsedBytes = BigInt(dbUser.storageUsedBytes ?? 0);
            session.user.documentsCount = dbUser.documentsCount ?? 0;
          } else {
            console.log('User not found in Firestore for ID:', token.sub);
          }
        } catch (error) {
          console.error('Error fetching user from Firestore:', error);
          console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        console.log('Missing token.sub or session.user');
      }
      
      console.log('=== SESSION CALLBACK END ===');
      return session
    },
    async jwt({ user, token, account, profile, trigger }) {
      console.log('=== JWT CALLBACK START ===');
      console.log('JWT callback details:', {
        hasUser: !!user,
        hasToken: !!token,
        hasAccount: !!account,
        hasProfile: !!profile,
        trigger: trigger
      });
      
      if (user) {
        console.log('Setting token.sub from user:', user.id);
        token.sub = user.id
      }
      
      console.log('=== JWT CALLBACK END ===');
      return token
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  events: {
    async signIn(message) {
      console.log('=== NEXTAUTH SIGNIN EVENT ===');
      console.log('SignIn event:', message);
    },
    async signOut(message) {
      console.log('=== NEXTAUTH SIGNOUT EVENT ===');
      console.log('SignOut event:', message);
    },
    async session(message) {
      console.log('=== NEXTAUTH SESSION EVENT ===');
      console.log('Session event:', message);
    },
    async createUser(message) {
      console.log('=== NEXTAUTH CREATE USER EVENT ===');
      console.log('Create user event:', message);
    },
  },
} 