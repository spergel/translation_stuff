'use client'

import { useState, useCallback, useRef } from 'react'
import { TranslationJob, TranslationResult, UserTier, TargetLanguage } from '../types/translation'

export function useTranslationJobs() {
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const jobsRef = useRef<TranslationJob[]>([])

  // Keep ref in sync with state
  jobsRef.current = jobs

  const addJob = useCallback((file: File): string => {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const newJob: TranslationJob = {
      id: jobId,
      filename: file.name,
      status: 'uploading',
      progress: 0,
      originalFile: file,
      abortController: new AbortController()
    }

    setJobs(prev => [...prev, newJob])
    return jobId
  }, [])

  const updateJobProgress = useCallback((jobId: string, progress: number, message?: string) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, progress, ...(message && { currentMessage: message }) }
        : job
    ))
  }, [])

  const updateJobStatus = useCallback((jobId: string, status: TranslationJob['status'], error?: string) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, status, ...(error && { error }) }
        : job
    ))
  }, [])

  const setJobResults = useCallback((jobId: string, results: TranslationResult[], totalPages?: number) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { 
            ...job, 
            results, 
            totalPages,
            status: 'completed',
            progress: 100
          }
        : job
    ))
  }, [])

  const setJobTotalPages = useCallback((jobId: string, totalPages: number) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, totalPages }
        : job
    ))
  }, [])

  const setJobCurrentPage = useCallback((jobId: string, currentPage: number) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, currentPage }
        : job
    ))
  }, [])

  const cancelJob = useCallback((jobId: string) => {
    setJobs(prev => prev.map(job => {
      if (job.id === jobId) {
        job.abortController?.abort()
        return { ...job, status: 'cancelled' as const }
      }
      return job
    }))
  }, [])

  const removeJob = useCallback((jobId: string) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === jobId)
      if (job?.abortController) {
        job.abortController.abort()
      }
      return prev.filter(j => j.id !== jobId)
    })
  }, [])

  const retryJob = useCallback((jobId: string) => {
    setJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { 
            ...job, 
            status: 'uploading',
            progress: 0,
            error: undefined,
            abortController: new AbortController()
          }
        : job
    ))
  }, [])

  const startTranslation = useCallback(async (
    jobId: string,
    targetLanguage: TargetLanguage,
    userTier: UserTier,
    extractImages: boolean
  ) => {
    // Use ref to get current job without dependency issues
    const job = jobsRef.current.find(j => j.id === jobId)
    if (!job || !job.originalFile) {
      console.error('Job not found or no file:', jobId)
      return
    }

    console.log('Starting translation for job:', jobId, 'with settings:', {
      targetLanguage,
      userTier,
      extractImages
    })

    try {
      updateJobStatus(jobId, 'processing')
      updateJobProgress(jobId, 5, 'Starting translation...')

      const formData = new FormData()
      formData.append('file', job.originalFile)
      formData.append('targetLanguage', targetLanguage)
      formData.append('userTier', userTier)
      formData.append('extractImages', extractImages.toString())

      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData,
        signal: job.abortController?.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      const results: TranslationResult[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'translation') {
                results.push(data.translation)
                updateJobProgress(jobId, data.progress, data.message)
                setJobCurrentPage(jobId, data.translation.page_number)
              } else if (data.type === 'complete') {
                setJobResults(jobId, data.results, data.metadata?.total_pages)
                return
              } else if (data.type === 'error') {
                throw new Error(data.error)
              } else {
                // Regular progress update
                updateJobProgress(jobId, data.progress, data.message)
                
                // Extract total pages from initial messages
                if (data.message && data.message.includes('Found') && data.message.includes('pages')) {
                  const match = data.message.match(/Found (\d+) pages/)
                  if (match) {
                    setJobTotalPages(jobId, parseInt(match[1]))
                  }
                }
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Translation error for job', jobId, ':', error)
      if (error instanceof Error && error.name === 'AbortError') {
        updateJobStatus(jobId, 'cancelled')
      } else {
        updateJobStatus(jobId, 'error', error instanceof Error ? error.message : 'Unknown error')
      }
    }
  }, [updateJobStatus, updateJobProgress, setJobResults, setJobTotalPages, setJobCurrentPage])

  return {
    jobs,
    addJob,
    updateJobProgress,
    updateJobStatus,
    setJobResults,
    setJobTotalPages,
    setJobCurrentPage,
    cancelJob,
    removeJob,
    retryJob,
    startTranslation
  }
} 