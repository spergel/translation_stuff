'use client'

import React from 'react'
import { UserTier, TargetLanguage } from '../types/translation'

interface TranslationSettingsProps {
  selectedLanguage: TargetLanguage
  setSelectedLanguage: (language: TargetLanguage) => void
  userTier: UserTier
  setUserTier?: (tier: UserTier) => void
  globalDownloadFormat: 'pdf' | 'html'
  setGlobalDownloadFormat: (format: 'pdf' | 'html') => void
}

export default function TranslationSettings({
  selectedLanguage,
  setSelectedLanguage,
  userTier,
  setUserTier,
  globalDownloadFormat,
  setGlobalDownloadFormat
}: TranslationSettingsProps) {
  const languages: { value: TargetLanguage; label: string }[] = [
    { value: 'english', label: 'English' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'french', label: 'French' },
    { value: 'german', label: 'German' },
    { value: 'italian', label: 'Italian' },
    { value: 'portuguese', label: 'Portuguese' },
    { value: 'russian', label: 'Russian' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'korean', label: 'Korean' }
  ]

  const tiers: { value: UserTier; label: string; description: string }[] = [
    { value: 'free', label: 'Free', description: '5 documents, 5GB storage' },
    { value: 'basic', label: 'Basic', description: '50 documents, 5GB storage' },
    { value: 'pro', label: 'Pro', description: '500 documents, 25GB storage' },
    { value: 'enterprise', label: 'Enterprise', description: 'Unlimited documents, 50GB storage' }
  ]

  const gridCols = setUserTier ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-primary-300 mb-6 font-serif">Translation Settings</h3>
      
      <div className={`grid ${gridCols} gap-6`}>
        {/* Target Language */}
        <div>
          <label htmlFor="target-language" className="block text-sm font-medium text-primary-300 mb-2">
            Target Language
          </label>
          <select
            id="target-language"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value as TargetLanguage)}
            className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-white text-primary-300"
          >
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        {/* User Tier - Only show if setUserTier is provided */}
        {setUserTier && (
          <div>
            <label htmlFor="user-tier" className="block text-sm font-medium text-primary-300 mb-2">
              Subscription Tier (Testing)
            </label>
            <select
              id="user-tier"
              value={userTier}
              onChange={(e) => setUserTier(e.target.value as UserTier)}
              className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-white text-primary-300"
            >
              {tiers.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label} ({tier.description})
                </option>
              ))}
            </select>
            <p className="text-xs text-primary-200 mt-1">
              Higher tiers get more storage and faster processing
            </p>
          </div>
        )}
      </div>
    </div>
  )
} 