'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SignInPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to the default NextAuth sign-in page
    window.location.href = '/api/auth/signin'
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center">
        <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
          Redirecting to sign-in...
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          If you are not redirected, <a href="/api/auth/signin" className="text-blue-600 underline">click here</a>.
        </p>
      </div>
    </div>
  )
} 