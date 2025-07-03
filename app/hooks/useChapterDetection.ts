import { useCallback } from 'react'
import { TranslationJob } from '../types/translation'

export function useChapterDetection() {
  const triggerChapterDetection = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      console.log('🔍 Triggering chapter detection for document:', documentId)
      
      const response = await fetch(`/api/documents/${documentId}/chapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('❌ Chapter detection failed:', error)
        return false
      }

      const result = await response.json()
      console.log('✅ Chapter detection completed:', result)
      return true
      
    } catch (error) {
      console.error('❌ Error triggering chapter detection:', error)
      return false
    }
  }, [])

  const shouldTriggerChapterDetection = useCallback((job: TranslationJob): boolean => {
    // Only trigger for paid users when translation is completed
    const userTier = job.metadata?.userTier || 'free'
    const isCompleted = job.status === 'completed'
    const hasResults = Boolean(job.results && job.results.length > 0)
    const isPaidUser = userTier !== 'free'
    
    return isCompleted && hasResults && isPaidUser
  }, [])

  return {
    triggerChapterDetection,
    shouldTriggerChapterDetection,
  }
} 