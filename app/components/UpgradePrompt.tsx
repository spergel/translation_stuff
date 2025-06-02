'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Zap, Crown } from 'lucide-react'
import { SUBSCRIPTION_PLANS, getUpgradeSuggestion } from '../lib/stripe'

interface UpgradePromptProps {
  reason?: 'document_limit' | 'storage_limit'
  className?: string
}

export default function UpgradePrompt({ reason, className = '' }: UpgradePromptProps) {
  const { data: session } = useSession()
  const router = useRouter()

  if (!session?.user) return null

  const currentTier = session.user.tier as keyof typeof SUBSCRIPTION_PLANS
  const currentPlan = SUBSCRIPTION_PLANS[currentTier]
  
  // Check if user needs upgrade
  const suggestion = getUpgradeSuggestion(
    currentTier,
    session.user.documentsCount,
    Number(session.user.storageUsedBytes)
  )

  // Don't show if no upgrade needed or already on enterprise
  if (!suggestion || currentTier === 'enterprise') return null

  const suggestedPlan = SUBSCRIPTION_PLANS[suggestion.suggested as keyof typeof SUBSCRIPTION_PLANS]
  
  const getMessage = () => {
    if (reason === 'document_limit') {
      return `You've reached your ${currentPlan.features.documents} document limit. Upgrade to get ${suggestedPlan.features.documents} documents!`
    }
    if (reason === 'storage_limit') {
      return `You're running out of storage. Upgrade to get ${suggestedPlan.features.storage} of space!`
    }
    
    // General upgrade suggestion
    const docsUsed = session.user.documentsCount
    const storageUsedMB = Math.round(Number(session.user.storageUsedBytes) / (1024 * 1024))
    
    if (suggestion.reason === 'document limit') {
      return `You're using ${docsUsed}/${currentPlan.features.documents} documents. Upgrade for more capacity!`
    }
    
    return `Upgrade to ${suggestedPlan.name} for more documents and storage!`
  }

  const getIcon = () => {
    if (suggestion.suggested === 'pro') return <Crown className="h-5 w-5 text-purple-600" />
    if (suggestion.suggested === 'enterprise') return <Zap className="h-5 w-5 text-emerald-600" />
    return <ArrowUp className="h-5 w-5 text-blue-600" />
  }

  const getColors = () => {
    if (reason === 'document_limit' || reason === 'storage_limit') {
      return 'bg-red-50 border-red-200 text-red-800'
    }
    if (suggestion.suggested === 'pro') {
      return 'bg-purple-50 border-purple-200 text-purple-800'
    }
    return 'bg-blue-50 border-blue-200 text-blue-800'
  }

  return (
    <div className={`rounded-lg border p-4 ${getColors()} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div>
            <div className="text-sm font-medium">
              {reason ? 'Upgrade Required' : 'Upgrade Available'}
            </div>
            <div className="text-xs opacity-90">
              {getMessage()}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium">
            ${suggestedPlan.price}/{suggestedPlan.period}
          </span>
          <button
            onClick={() => router.push('/pricing')}
            className="px-3 py-1 bg-white border border-current rounded text-xs font-medium hover:bg-opacity-90 transition-colors"
          >
            Upgrade
          </button>
        </div>
      </div>
    </div>
  )
} 