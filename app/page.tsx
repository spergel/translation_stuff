'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Trash2 } from 'lucide-react'
import { extractImagesFromPDF } from './utils/pdfUtils'
import { TranslationResult, TranslationJob, TranslationMetadata } from './types/translation'
import JobItem from './components/JobItem'
import DownloadAllButton from './components/DownloadAllButton'
import { processDocumentChunked } from './utils/chunkedTranslation'
import { TargetLanguage, UserTier } from './types/translation'
import JobQueue from './components/JobQueue'
import TranslationSettings from './components/TranslationSettings'

export default function Home() {
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState<TargetLanguage>('english')
  const [userTier, setUserTier] = useState<UserTier>('enterprise')
  const [globalDownloadFormat, setGlobalDownloadFormat] = useState<'pdf' | 'html'>('pdf') // Global PDF/HTML toggle

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Check file limits based on tier
    const tierLimits = {
      free: { maxFiles: 1, maxSizeMB: 10 },
      basic: { maxFiles: 3, maxSizeMB: 50 },
      pro: { maxFiles: 10, maxSizeMB: 100 },
      enterprise: { maxFiles: 50, maxSizeMB: 500 }
    }

    const limits = tierLimits[userTier]
    
    if (acceptedFiles.length > limits.maxFiles) {
      alert(`${userTier} tier allows maximum ${limits.maxFiles} files. Please select fewer files.`)
      return
    }

    const validFiles = acceptedFiles.filter(file => {
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > limits.maxSizeMB) {
        alert(`File "${file.name}" (${Math.round(sizeMB)}MB) exceeds ${userTier} tier limit of ${limits.maxSizeMB}MB`)
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

    console.log(`📁 Processing ${validFiles.length} files for ${userTier} tier (${jobs.filter(j => j.status === 'processing').length} active jobs)`)

    // Check for batch processing efficiency
    for (const file of validFiles) {
      const sizeMB = Math.round(file.size / 1024 / 1024 * 100) / 100
      
      // Estimate page count based on file size (rough approximation)
      const estimatedPages = Math.round(sizeMB * 2.3) // Rough estimate: ~2.3 pages per MB
      
      if (estimatedPages > 50) {
        console.log(`📊 "${file.name}" has estimated ${estimatedPages} pages. Processing in batches for optimal performance.`)
      }
    }

    // Create all jobs first so they show immediately
    const newJobs: TranslationJob[] = validFiles.map(file => {
      const jobId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9)
      const abortController = new AbortController()
      
      return {
        id: jobId,
        filename: file.name,
        status: 'uploading',
        progress: 0,
        originalFile: file,
        abortController,
        statusMessage: 'Preparing for translation...'
      }
    })

    // Add all jobs to state immediately so they show up
    setJobs(prev => [...prev, ...newJobs])

    // Now process each file
    for (let i = 0; i < newJobs.length; i++) {
      const job = newJobs[i]
      const file = validFiles[i]

      console.log(`📄 Starting processing for: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100} MB)`)

      const startTime = Date.now()

      try {
        // Use chunked processing for all files to avoid 413 errors
        console.log(`🚀 Starting chunked processing for: ${file.name}`)
        
        setJobs(prev => prev.map(j => j.id === job.id ? { 
          ...j, 
          status: 'processing', 
          progress: 5,
          statusMessage: 'Using Gemini native image understanding...'
        } : j))
        
        // Process document using chunked approach
        const results = await processDocumentChunked({
          file,
          targetLanguage: selectedLanguage,
          userTier,
          onProgress: (progress, message) => {
            setJobs(prev => prev.map(j => j.id === job.id ? {
              ...j,
              progress,
              statusMessage: message
            } : j))
          },
          onPageComplete: (result) => {
            setJobs(prev => prev.map(j => j.id === job.id ? {
              ...j,
              results: [...(j.results || []), result].sort((a, b) => a.page_number - b.page_number)
            } : j))
          },
          signal: job.abortController?.signal
        })
        
        // Calculate performance metrics
                  const endTime = Date.now()
                  const totalTime = Math.round((endTime - startTime) / 1000)
        const pagesCount = results.length
                  const timePerPage = Math.round(totalTime / pagesCount * 10) / 10
                  
        console.log(`🎉 Chunked processing completed for ${file.name} in ${totalTime}s for ${pagesCount} pages (${timePerPage}s per page)`)
        
        // Update job to completed
        setJobs(prev => prev.map(j => j.id === job.id ? {
          ...j,
          status: 'completed',
                        progress: 100,
          results,
          totalPages: pagesCount,
          statusMessage: `Completed ${pagesCount} pages in ${totalTime}s (${timePerPage}s/page)`
        } : j))

      } catch (error) {
        // Check if the error is due to cancellation
        if (error instanceof Error && error.name === 'AbortError') {
          console.log(`🛑 Translation was cancelled for job ${job.id}`)
          setJobs(prev => prev.map(currentJob => 
            currentJob.id === job.id 
              ? { ...currentJob, status: 'cancelled', error: 'Translation was cancelled by user' }
              : currentJob
          ))
        } else {
          console.log(`❌ Translation failed for ${file.name}:`, error)
          setJobs(prev => prev.map(currentJob => 
            currentJob.id === job.id 
              ? { ...currentJob, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
              : currentJob
          ))
        }
      }
    }
  }, [selectedLanguage, userTier, jobs])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  })

  const deleteJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    
    if (job?.status === 'processing' || job?.status === 'uploading') {
      // Show confirmation for active translations
      const confirmed = window.confirm(
        `This translation is currently ${job.status}. Are you sure you want to cancel it?\n\n` +
        `This will stop both text translation and image extraction.`
      )
      
      if (!confirmed) return
      
      // Cancel the ongoing request
      if (job.abortController) {
        job.abortController.abort()
        console.log(`🛑 Cancelled translation for job ${jobId}`)
      }
      
      // Update job status to cancelled
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { ...job, status: 'cancelled', error: 'Translation was cancelled by user' }
          : job
      ))
    } else {
      // For completed/error jobs, just show simple confirmation
      const confirmed = window.confirm('Are you sure you want to delete this translation?')
      if (!confirmed) return
    }
    
    // Remove the job from the list
    setJobs(prev => prev.filter(job => job.id !== jobId))
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
    <div className="min-h-screen bg-primary-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary-300 mb-4">
            PDF Translator
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your PDF documents and get AI-powered translations with side-by-side comparison. 
            Supports documents up to 100 pages.
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Language
            </label>
            <select 
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as TargetLanguage)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-300 focus:border-primary-300"
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="french">French</option>
              <option value="german">German</option>
              <option value="italian">Italian</option>
              <option value="portuguese">Portuguese</option>
              <option value="russian">Russian</option>
              <option value="chinese">Chinese</option>
              <option value="japanese">Japanese</option>
              <option value="arabic">Arabic</option>
            </select>
          </div>

          {/* SaaS Tier Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subscription Tier (Testing)
            </label>
            <select 
              value={userTier}
              onChange={(e) => setUserTier(e.target.value as UserTier)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-300 focus:border-primary-300"
            >
              <option value="free">Free (50 pages, 5-page batches)</option>
              <option value="basic">Basic (100 pages, 20-page batches)</option>
              <option value="pro">Pro (500 pages, 50-page batches)</option>
              <option value="enterprise">Enterprise (unlimited, 100-page batches)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Higher tiers process multiple pages simultaneously for faster results
            </p>
          </div>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-primary-300 bg-primary-50' 
                : 'border-gray-300 hover:border-primary-200'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            {isDragActive ? (
              <p className="text-lg text-primary-300">Drop the PDF files here...</p>
            ) : (
              <div>
                <p className="text-lg text-gray-600 mb-2">
                  Drag & drop PDF files here, or click to select
                </p>
                <div className="text-sm text-gray-500 space-y-1">
                  <p>
                    {userTier === 'free' && 'Free tier: 1 file, 50 pages max'}
                    {userTier === 'basic' && 'Basic tier: 2 files, 100 pages each'}
                    {userTier === 'pro' && 'Pro tier: 5 files, 500 pages each'}
                    {userTier === 'enterprise' && 'Enterprise tier: 10 files, unlimited pages'}
                  </p>
                  {(() => {
                    const activeJobs = jobs.filter(job => 
                      job.status === 'uploading' || job.status === 'processing'
                    ).length
                    const tierLimits = {
                      free: 1,
                      basic: 3,
                      pro: 10,
                      enterprise: 50
                    }
                    const maxFiles = tierLimits[userTier as keyof typeof tierLimits] || 1
                    
                    if (maxFiles === -1) {
                      return activeJobs > 0 ? (
                        <p className="text-blue-600">Currently processing {activeJobs} files</p>
                      ) : null
                    } else {
                      return (
                        <p className={`${activeJobs >= maxFiles ? 'text-red-600' : 'text-blue-600'}`}>
                          Active jobs: {activeJobs}/{maxFiles}
                          {activeJobs >= maxFiles && ' (limit reached)'}
                        </p>
                      )
                    }
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Translation Jobs ({jobs.length})
              </h2>
              <div className="flex items-center space-x-4">
                {/* Global PDF/HTML Toggle */}
                <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-md">
                  <span className={`text-sm ${globalDownloadFormat === 'pdf' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    PDF
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={globalDownloadFormat === 'html'}
                      onChange={(e) => setGlobalDownloadFormat(e.target.checked ? 'html' : 'pdf')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  <span className={`text-sm ${globalDownloadFormat === 'html' ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    HTML
                  </span>
                </div>
                
                <DownloadAllButton jobs={jobs} downloadFormat={globalDownloadFormat} />
                <button
                  onClick={clearAllJobs}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            {jobs.map((job) => (
              <JobItem key={job.id} job={job} onDelete={deleteJob} getAllJobs={getAllJobs} downloadFormat={globalDownloadFormat} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 