'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Trash2, Lock, Save, User, Check, CreditCard } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { extractImagesFromPDF } from './utils/pdfUtils'
import { TranslationResult, TranslationJob, TranslationMetadata } from './types/translation'
import JobItem from './components/JobItem'
import DownloadAllButton from './components/DownloadAllButton'
import { processDocumentChunked } from './utils/chunkedTranslation'
import FileStorageManager from './utils/fileStorage'
import { TargetLanguage, UserTier } from './types/translation'
import JobQueue from './components/JobQueue'
import TranslationSettings from './components/TranslationSettings'
import Header from './components/Header'
import LoginButton from './components/auth/LoginButton'
import Link from 'next/link'
import { SUBSCRIPTION_PLANS } from './lib/stripe'

export default function Home() {
  const { data: session, status } = useSession()
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState<TargetLanguage>('english')
  const [globalDownloadFormat, setGlobalDownloadFormat] = useState<'pdf' | 'html'>('pdf')
  const [showSavePrompt, setShowSavePrompt] = useState(false)

  // Get user tier from session, fallback to free for anonymous users
  const userTier: UserTier = (session?.user?.tier as UserTier) || 'free'

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // File limits for anonymous users (more restrictive)
    const tierLimits = {
      free: { maxFiles: 1, maxSizeMB: 25 },
      basic: { maxFiles: 3, maxSizeMB: 25 },
      pro: { maxFiles: 10, maxSizeMB: 100 },
      enterprise: { maxFiles: 50, maxSizeMB: 2000 },
      anonymous: { maxFiles: 1, maxSizeMB: 5 }
    }

    const limits = session?.user ? tierLimits[userTier] : tierLimits.anonymous
    
    if (acceptedFiles.length > limits.maxFiles) {
      if (!session?.user) {
        alert(`Anonymous users can translate 1 file at a time (max 5MB). Sign in for higher limits!`)
      } else {
        alert(`${userTier} tier allows maximum ${limits.maxFiles} files. Please select fewer files.`)
      }
      return
    }

    const validFiles = acceptedFiles.filter(file => {
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > limits.maxSizeMB) {
        if (!session?.user) {
          alert(`File "${file.name}" (${Math.round(sizeMB)}MB) exceeds anonymous limit of ${limits.maxSizeMB}MB. Sign in for higher limits!`)
        } else {
          alert(`File "${file.name}" (${Math.round(sizeMB)}MB) exceeds ${userTier} tier limit of ${limits.maxSizeMB}MB`)
        }
        return false
      }
      return true
    })

    if (validFiles.length === 0) {
      alert('No valid files to process.')
      return
    }

    const totalSizeMB = validFiles.reduce((sum, file) => sum + file.size / (1024 * 1024), 0)
    
    if (validFiles.length > 1) {
      const confirmed = confirm(
        `You are about to process ${validFiles.length} PDF files (${Math.round(totalSizeMB)}MB total). ` +
        `This will use significant computational resources. Continue?`
      )
      if (!confirmed) return
    }

    console.log(`📁 Processing ${validFiles.length} files for ${session?.user ? userTier : 'anonymous'} user`)

    // Create all jobs first so they show immediately
    const newJobs: TranslationJob[] = []

    for (const file of validFiles) {
      const jobId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9)
      const abortController = new AbortController()
      let documentId: string | undefined = undefined
      
      // Only create database record if user is authenticated
      if (session?.user) {
        try {
          // Create document in database first
          const documentResponse = await fetch('/api/documents', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              originalFilename: file.name,
              title: file.name.replace('.pdf', ''),
              targetLanguage: selectedLanguage,
              originalFileSize: file.size,
              translationSettings: {
                extractImages: true,
                userTier,
              }
            })
          })

          if (!documentResponse.ok) {
            const error = await documentResponse.json()
            
            // Handle specific error codes
            if (error.code === 'DOCUMENT_LIMIT_EXCEEDED' || error.code === 'STORAGE_LIMIT_EXCEEDED') {
              alert(error.error)
              continue // Skip this file but process others
            }
            
            throw new Error(error.error || 'Failed to create document')
          }

          const { document } = await documentResponse.json()
          documentId = document.id
        } catch (error) {
          console.error(`Failed to create document for ${file.name}:`, error)
          alert(`Failed to start processing for ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          continue
        }
      }
        
      // Create form data for the translation request
      const formData = new FormData()
      formData.append('file', file)
      formData.append('targetLanguage', selectedLanguage)

      // Queue the translation job
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error('Failed to queue translation job')
        }

        const { jobId: queueJobId } = await response.json()
        
      const job: TranslationJob = {
        id: jobId,
        filename: file.name,
          status: 'queued',
        progress: 0,
        originalFile: file,
        abortController,
          statusMessage: 'Queued for translation...',
          documentId,
          queueJobId // Store the queue job ID for status updates
      }

      newJobs.push(job)
      } catch (error) {
        console.error(`Failed to queue translation for ${file.name}:`, error)
        alert(`Failed to queue translation for ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        continue
      }
    }

    // Add all valid jobs to state immediately so they show up
    setJobs(prev => [...prev, ...newJobs])

    // Show save prompt for anonymous users after they start translation
    if (!session?.user && newJobs.length > 0) {
      setShowSavePrompt(true)
    }

    // Start polling for job status
    for (const job of newJobs) {
      if (job.queueJobId) {
        pollJobStatus(job.queueJobId, job.id)
      }
    }
  }, [selectedLanguage, userTier, session])

  // Add polling function
  const pollJobStatus = async (queueJobId: string, localJobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/translate?jobId=${queueJobId}`)
        if (!response.ok) {
          throw new Error('Failed to get job status')
        }

        const { state, progress, result } = await response.json()

        setJobs(prev => prev.map(job => {
          if (job.id === localJobId) {
            const updatedJob = { ...job }

            // Update status based on queue state
            switch (state) {
              case 'completed':
                updatedJob.status = 'completed'
                updatedJob.progress = 100
                updatedJob.results = result?.results
                updatedJob.statusMessage = 'Translation complete!'
                clearInterval(pollInterval)
                break
              case 'failed':
                updatedJob.status = 'error'
                updatedJob.error = result?.error || 'Translation failed'
                clearInterval(pollInterval)
                break
              case 'active':
                updatedJob.status = 'processing'
                updatedJob.progress = progress || 0
                updatedJob.statusMessage = 'Processing...'
                break
              case 'waiting':
                updatedJob.status = 'queued'
                updatedJob.progress = 0
                updatedJob.statusMessage = 'Waiting to start...'
                break
            }

            return updatedJob
          }
          return job
        }))
      } catch (error) {
        console.error('Error polling job status:', error)
        clearInterval(pollInterval)
          }
    }, 2000) // Poll every 2 seconds
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  })

  const deleteJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    
    if (job?.status === 'processing' || job?.status === 'uploading') {
      // Show confirmation for active translations
      if (!confirm('This translation is in progress. Are you sure you want to cancel it?')) {
        return
      }

      // If job has a queue ID, cancel it in Redis
      if (job.queueJobId) {
        try {
          const response = await fetch(`/api/translate?jobId=${job.queueJobId}`, {
            method: 'DELETE'
          });

          if (!response.ok) {
            throw new Error('Failed to cancel job');
          }
        } catch (error) {
          console.error('Error cancelling job:', error);
          alert('Failed to cancel job. Please try again.');
          return;
        }
      }

      // Abort any ongoing fetch requests
      job.abortController?.abort()
    }

    // Remove job from state
    setJobs(prev => prev.filter(j => j.id !== jobId))
  }

  const clearAllJobs = () => {
    const activeJobs = jobs.filter(job => 
      job.status === 'processing' || job.status === 'uploading'
    )
    
    if (activeJobs.length > 0) {
      const confirmed = window.confirm(
        `${activeJobs.length} translation${activeJobs.length > 1 ? 's are' : ' is'} still in progress.\n\n` +
        `Are you sure you want to cancel all translations and clear all jobs?\n\n` +
        `All ongoing translations will stop immediately and cannot be resumed.`
      )
      
      if (!confirmed) {
        return // User cancelled the clear all
      }
      
      // Cancel all ongoing translations
      activeJobs.forEach(job => {
        if (job.abortController) {
          console.log(`🛑 Cancelling translation for job ${job.id}`)
          job.abortController.abort()
        }
      })
    }
    
    setJobs([])
  }

  // Function to get the latest job states for components that need fresh data
  const getAllJobs = () => jobs

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <Header />
      
      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary-300 mb-4 font-serif">
            AI-Powered PDF Translation
          </h1>
          <p className="text-lg text-primary-200 max-w-2xl mx-auto leading-relaxed font-serif">
            Upload your PDF documents and get AI-powered translations with side-by-side comparison. 
            Supports documents up to 100 pages.
          </p>
        </div>

        {/* User Status Bar - Clean single section */}
        {!session && status !== 'loading' && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-amber-900">
                      Translating as Guest
                    </div>
                    <div className="text-xs text-amber-700">
                      Limit: 1 file, 5MB max • Sign in to save your work and get higher limits
                    </div>
                  </div>
                </div>
                <LoginButton />
              </div>
            </div>
          </div>
        )}

        {/* Save Prompt for Anonymous Users - Integrated into existing flow */}
        {showSavePrompt && !session && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Save className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-emerald-900">
                      Save this translation?
                    </div>
                    <div className="text-xs text-emerald-700">
                      Sign in now to save your work and access it from any device
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowSavePrompt(false)}
                    className="text-xs text-emerald-600 hover:text-emerald-500 font-medium"
                  >
                    Maybe later
                  </button>
                  <LoginButton />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Translation Settings */}
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
          <div className="p-6">
            <TranslationSettings
              selectedLanguage={selectedLanguage}
              setSelectedLanguage={setSelectedLanguage}
              userTier={userTier}
              setUserTier={undefined}
              globalDownloadFormat={globalDownloadFormat}
              setGlobalDownloadFormat={setGlobalDownloadFormat}
            />
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
          <div className="p-6">
            <div
              {...getRootProps()}
              className={`upload-area ${isDragActive ? 'drag-active' : ''} min-h-[200px] flex items-center justify-center border-2 border-dashed border-amber-300 rounded-lg transition-colors ${isDragActive ? 'border-amber-400 bg-amber-50' : 'hover:border-amber-400 hover:bg-amber-50/30'}`}
            >
              <input {...getInputProps()} />
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-amber-400 mb-4" />
                <div className="text-lg font-medium text-primary-300 mb-2">
                  {isDragActive ? 'Drop PDF files here' : 'Drag & drop PDF files here, or click to select'}
                </div>
                {session ? (
                  <>
                    <div className="text-sm text-primary-200 mb-1">
                      {userTier === 'free'
                        ? 'Free tier: 1 file at a time, 25MB max per file'
                        : userTier === 'basic'
                          ? 'Basic tier: up to 3 files at a time, 25MB max per file'
                          : userTier === 'pro'
                            ? 'Pro tier: up to 10 files at a time, 100MB max per file'
                            : userTier === 'enterprise'
                              ? 'Enterprise: up to 50 files at a time, 2GB max per file'
                              : 'Guest: 1 file, 5MB max'}
                      {session.user.isEduEmail && <span className="ml-2 text-emerald-600">(.edu account)</span>}
                    </div>
                    {session && (
                      <div className="text-xs text-primary-100">
                        Stored: {session.user.documentsCount} of 1 documents • {Math.round(Number(session.user.storageUsedBytes) / (1024 * 1024))}MB used
                        {userTier === 'free' && session.user.documentsCount >= 1 && (
                          <span className="ml-2 text-amber-600">Delete old documents to upload new ones.</span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-amber-600">
                    Guest mode: 1 file, 5MB max • Translations not saved
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
              <span className="ml-3 text-primary-200">Loading...</span>
            </div>
          </div>
        )}

        {/* Job Queue */}
        {jobs.length > 0 && (
          <div className="space-y-6">
            <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
              {/* Show download format selection only if at least one job is completed */}
              {jobs.some(j => j.status === 'completed') && (
                <div className="mb-6 flex items-center space-x-6">
                  <label className="text-sm font-medium text-primary-300">Download Format:</label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="pdf"
                      checked={globalDownloadFormat === 'pdf'}
                      onChange={() => setGlobalDownloadFormat('pdf')}
                      className="text-amber-500 focus:ring-amber-300 border-amber-300"
                    />
                    <span className="text-sm font-medium text-primary-300">PDF</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="html"
                      checked={globalDownloadFormat === 'html'}
                      onChange={() => setGlobalDownloadFormat('html')}
                      className="text-amber-500 focus:ring-amber-300 border-amber-300"
                    />
                    <span className="text-sm font-medium text-primary-300">HTML</span>
                  </label>
                </div>
              )}
              <div className="flex items-center justify-between mb-6">
                <h2 className="section-header mb-0">Translation Progress</h2>
                <div className="flex items-center space-x-3">
                  <DownloadAllButton 
                    jobs={jobs} 
                    format={globalDownloadFormat}
                    className="btn btn-secondary btn-sm"
                  />
                  <button
                    onClick={clearAllJobs}
                    className="btn btn-secondary btn-sm flex items-center space-x-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Clear All</span>
                  </button>
                </div>
              </div>
              <JobQueue jobs={jobs} deleteJob={deleteJob} format={globalDownloadFormat} />
            </div>
          </div>
        )}

        {/* Pricing Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center text-primary-300 hover:text-primary-400 font-medium text-lg border border-amber-200 rounded-lg px-6 py-3 bg-white shadow-sm hover:bg-amber-50 transition-all duration-200"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              View premium pricing details
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
} 