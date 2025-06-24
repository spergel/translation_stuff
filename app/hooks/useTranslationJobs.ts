'use client'

import { useState, useEffect } from 'react'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

export interface TranslationJob {
  id: string
  userId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  sourceLanguage: string
  targetLanguage: string
  createdAt: Date
  updatedAt: Date
  fileUrl?: string
  resultUrl?: string
  error?: string
}

export function useTranslationJobs() {
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) {
      setJobs([])
      setLoading(false)
      return
    }

    const jobsQuery = query(
      collection(db, 'translationJobs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const jobsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        })) as TranslationJob[]
        setJobs(jobsData)
        setLoading(false)
      },
      (err) => {
        console.error('Error fetching jobs:', err)
        setError('Failed to fetch translation jobs')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user])

  const cancelJob = async (jobId: string) => {
    try {
      const jobRef = doc(db, 'translationJobs', jobId)
      await updateDoc(jobRef, {
        status: 'failed',
        error: 'Job cancelled by user',
        updatedAt: new Date(),
      })
    } catch (err) {
      console.error('Error cancelling job:', err)
      throw new Error('Failed to cancel job')
    }
  }

  return {
    jobs,
    loading,
    error,
    cancelJob,
  }
} 