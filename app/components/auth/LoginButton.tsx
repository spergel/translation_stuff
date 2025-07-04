'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { User, LogOut } from 'lucide-react'
import { useEffect } from 'react'

export default function LoginButton() {
  const { data: session, status } = useSession()

  // Add logging for session status changes
  useEffect(() => {
    console.log('=== LOGIN BUTTON SESSION STATUS CHANGE ===');
    console.log('Session status:', status);
    console.log('Session data:', session ? {
      user: {
        email: session.user?.email,
        name: session.user?.name,
        id: session.user?.id,
        tier: session.user?.tier,
        isEduEmail: session.user?.isEduEmail
      },
      expires: session.expires
    } : null);
  }, [session, status]);

  const handleSignIn = async () => {
    console.log('=== SIGN IN BUTTON CLICKED ===');
    try {
      console.log('Initiating Google sign-in...');
      const result = await signIn('google', { 
        callbackUrl: '/dashboard',
        redirect: true 
      });
      console.log('Sign-in result:', result);
    } catch (error) {
      console.error('Sign-in error:', error);
    }
  };

  const handleSignOut = async () => {
    console.log('=== SIGN OUT BUTTON CLICKED ===');
    try {
      console.log('Initiating sign-out...');
      const result = await signOut({ 
        callbackUrl: '/',
        redirect: true 
      });
      console.log('Sign-out result:', result);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  if (status === 'loading') {
    console.log('=== LOGIN BUTTON LOADING STATE ===');
    return (
      <div className="animate-pulse">
        <div className="h-10 w-24 bg-amber-100 rounded"></div>
      </div>
    )
  }

  if (session) {
    console.log('=== LOGIN BUTTON AUTHENTICATED STATE ===');
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {session.user.image ? (
            <img 
              src={session.user.image} 
              alt={session.user.name || 'User'} 
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <User className="w-8 h-8 p-1 bg-amber-100 rounded-full text-amber-600" />
          )}
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-primary-300">
              {session.user.name}
            </p>
            <p className="text-xs text-primary-200 capitalize">
              {session.user.tier} {session.user.isEduEmail && '(.edu)'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 px-3 py-2 text-sm text-primary-200 hover:text-primary-300 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    )
  }

  console.log('=== LOGIN BUTTON UNAUTHENTICATED STATE ===');
  return (
    <button
      onClick={handleSignIn}
      className="flex items-center gap-2 px-4 py-2 bg-primary-300 text-white rounded-lg hover:bg-primary-400 transition-all duration-200 shadow-sm hover:shadow-md"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </button>
  )
} 