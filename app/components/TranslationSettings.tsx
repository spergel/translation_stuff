'use client'

import React from 'react'
import { UserTier, TargetLanguage } from '../types/translation'

interface TranslationSettingsProps {
  targetLanguage: TargetLanguage
  setTargetLanguage: (language: TargetLanguage) => void
  userTier: UserTier
  setUserTier: (tier: UserTier) => void
  extractImages: boolean
  setExtractImages: (enabled: boolean) => void
}

export default function TranslationSettings({
  targetLanguage,
  setTargetLanguage,
  userTier,
  setUserTier,
  extractImages,
  setExtractImages
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
    { value: 'free', label: 'Free', description: '20 pages max, sequential processing' },
    { value: 'basic', label: 'Basic', description: '100 pages max, 20-page batches' },
    { value: 'pro', label: 'Pro', description: '500 pages max, 40-page batches' },
    { value: 'enterprise', label: 'Enterprise', description: 'Unlimited pages, 100-page batches' }
  ]

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Translation Settings</h3>
      
      {/* Target Language */}
      <div>
        <label htmlFor="target-language" className="block text-sm font-medium text-gray-700 mb-2">
          Target Language
        </label>
        <select
          id="target-language"
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value as TargetLanguage)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {languages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* User Tier */}
      <div>
        <label htmlFor="user-tier" className="block text-sm font-medium text-gray-700 mb-2">
          Subscription Tier
        </label>
        <select
          id="user-tier"
          value={userTier}
          onChange={(e) => setUserTier(e.target.value as UserTier)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {tiers.map((tier) => (
            <option key={tier.value} value={tier.value}>
              {tier.label} - {tier.description}
            </option>
          ))}
        </select>
      </div>

      {/* Extract Images */}
      <div>
        <label className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={extractImages}
            onChange={(e) => setExtractImages(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">
              Include Page Images
            </span>
            <p className="text-xs text-gray-500">
              {extractImages 
                ? '⚠️ Slower processing (~10s/page) but includes page images in exports' 
                : '⚡ Faster processing, text-only exports (recommended for speed)'
              }
            </p>
          </div>
        </label>
      </div>
    </div>
  )
} 