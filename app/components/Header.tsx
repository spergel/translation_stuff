'use client'

import { useSession } from 'next-auth/react'
import LoginButton from './auth/LoginButton'
import Link from 'next/link'
import { FileText, FolderOpen, BookOpen, CreditCard } from 'lucide-react'

export default function Header() {
  const { data: session } = useSession()

  const navigation = [
    { name: 'Dashboard', href: '/dashboard' },
  ]

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and main nav */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="p-2 rounded-lg bg-primary-50 group-hover:bg-primary-100 transition-colors">
                <BookOpen className="h-6 w-6 text-primary-300" />
              </div>
              <div>
                <span className="text-xl font-bold text-primary-300 font-serif">PDF Translator</span>
                <div className="text-xs text-primary-200 font-sans">AI-Powered Document Translation</div>
              </div>
            </Link>
            
            <nav className="hidden md:flex items-center space-x-6">
              {navigation.map((item) => (
                <Link 
                  key={item.name}
                  href={item.href}
                  className="flex items-center space-x-2 text-primary-200 hover:text-primary-300 transition-colors font-medium"
                >
                  {item.name === 'Dashboard' && <FolderOpen className="h-4 w-4" />}
                  <span>{item.name}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* User section */}
          <div className="flex items-center space-x-4">
            {session && (
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium text-primary-300 capitalize">
                  {session.user.tier} Tier
                  {session.user.isEduEmail && (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      .edu
                    </span>
                  )}
                </div>
                <div className="text-xs text-primary-200 font-mono">
                  {session.user.documentsCount} docs • {Math.round(Number(session.user.storageUsedBytes) / (1024 * 1024))}MB used
                </div>
              </div>
            )}
            <LoginButton />
          </div>
        </div>
      </div>
    </header>
  )
} 