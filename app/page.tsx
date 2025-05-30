'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Trash2 } from 'lucide-react'
import { extractImagesFromPDF } from './utils/pdfUtils'
import { TranslationResult, TranslationJob, TranslationMetadata } from './types/translation'
import JobItem from './components/JobItem'
import DownloadAllButton from './components/DownloadAllButton'

export default function Home() {
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState('english')
  const [userTier, setUserTier] = useState('free')
  const [globalDownloadFormat, setGlobalDownloadFormat] = useState<'pdf' | 'html'>('pdf') // Global PDF/HTML toggle

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Check file limits based on tier
    const tierConfig = {
      free: { maxFiles: 1, maxPages: 50 },
      basic: { maxFiles: 2, maxPages: 100 },
      pro: { maxFiles: 5, maxPages: 500 },
      business: { maxFiles: 10, maxPages: -1 },
      enterprise: { maxFiles: 10, maxPages: -1 }
    }
    
    const currentTierConfig = tierConfig[userTier as keyof typeof tierConfig] || tierConfig.free
    const currentActiveJobs = jobs.filter(job => 
      job.status === 'uploading' || job.status === 'processing'
    ).length
    
    // Check if adding these files would exceed the limit
    if (currentTierConfig.maxFiles !== -1 && (currentActiveJobs + acceptedFiles.length) > currentTierConfig.maxFiles) {
      alert(`${userTier.charAt(0).toUpperCase() + userTier.slice(1)} tier allows maximum ${currentTierConfig.maxFiles} concurrent files. You currently have ${currentActiveJobs} active jobs.`)
      return
    }

    console.log(`📁 Processing ${acceptedFiles.length} files for ${userTier} tier (${currentActiveJobs} active jobs)`)

    // Filter valid PDF files and check sizes
    const validFiles = acceptedFiles.filter(file => {
      if (file.type !== 'application/pdf') {
        alert(`Skipping "${file.name}" - Please upload only PDF files`)
        return false
      }
      
      // Log file size but don't block with dialogs
      const fileSizeMB = Math.round(file.size / 1024 / 1024 * 100) / 100
      if (fileSizeMB > 50) {
        console.log(`📁 Processing large file: "${file.name}" (${fileSizeMB}MB)`)
      }
      
      return true
    })

    // Quick page count estimation for user awareness (but no blocking dialogs)
    for (const file of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const pdfjsLib = await import('pdfjs-dist')
        const quickLoadingTask = pdfjsLib.getDocument({ data: uint8Array })
        const quickPdf = await quickLoadingTask.promise
        const pageCount = quickPdf.numPages
        
        if (pageCount > 50) {
          const tierMessages = {
            free: `"${file.name}" has ${pageCount} pages. Processing first ${currentTierConfig.maxPages} pages.`,
            basic: `"${file.name}" has ${pageCount} pages. Processing in batches for optimal performance.`,
            pro: `"${file.name}" has ${pageCount} pages. Processing in batches for optimal performance.`,
            enterprise: `"${file.name}" has ${pageCount} pages. Processing in batches for optimal performance.`
          }
          
          const message = tierMessages[userTier as keyof typeof tierMessages] || tierMessages.free
          console.log(`📊 ${message}`)
        } else if (pageCount > 20) {
          console.log(`📊 "${file.name}" has ${pageCount} pages - will skip client-side extraction for optimal performance`)
        }
      } catch (error) {
        console.warn(`Could not determine page count for ${file.name}:`, error)
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

      // 🚀 Start BOTH processes in parallel (the RIGHT way)
      console.log(`🚀 Starting parallel processing for: ${file.name}`)
      console.log(`   📸 Image extraction: Client-side (PDF.js)`)
      console.log(`   📝 Text translation: Server-side`)

      const startTime = Date.now()

      try {
        // Start image extraction in background (CLIENT-SIDE - this works!)
        const imageExtractionPromise = extractImagesFromPDF(file, {
          signal: job.abortController?.signal
        })
        
        // Start text translation (SERVER-SIDE)
        setJobs(prev => prev.map(j => j.id === job.id ? { 
          ...j, 
          status: 'processing', 
          progress: 10,
          statusMessage: 'Starting translation... (images extracting in background)'
        } : j))
        
        // Create FormData for translation
        const formData = new FormData()
        formData.append('file', file)
        formData.append('targetLanguage', selectedLanguage)
        formData.append('userTier', userTier)
        formData.append('extractImages', 'false') // Server does text-only for speed
        formData.append('jobId', job.id)
        
        // Start translation
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
        let extractedImages: any[] = []
        let imagesMerged = false

        // Process translation stream
        while (true) {
          // Check if the request was aborted
          if (job.abortController?.signal.aborted) {
            console.log(`🛑 Translation cancelled for job ${job.id}`)
            reader.cancel()
            break
          }

          const { done, value } = await reader.read()
          if (done) break

          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split('\n').filter(line => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6)
                
                // Check if the JSON data looks complete (basic validation)
                if (!jsonData.trim()) {
                  console.log('📭 Empty SSE data, skipping...')
                  continue
                }
                
                const data = JSON.parse(jsonData)
                
                console.log(`📨 Frontend received SSE data for ${file.name}:`, {
                  type: data.type,
                  status: data.status,
                  progress: data.progress,
                  message: data.message?.substring(0, 100) + '...',
                  hasResults: !!data.results,
                  resultsCount: data.results?.length || 0,
                  hasTranslation: !!data.translation
                })
                
                setJobs(prev => prev.map(currentJob => {
                  if (currentJob.id === job.id) {
                    // Handle different message types
                    if (data.type === 'translation' && data.translation) {
                      // Individual translation result
                      const existingResults = currentJob.results || []
                      const updatedResults = [...existingResults]
                      
                      // Check if this page already exists and update it, or add new
                      const existingIndex = updatedResults.findIndex(r => r.page_number === data.translation.page_number)
                      if (existingIndex >= 0) {
                        updatedResults[existingIndex] = data.translation
                      } else {
                        updatedResults.push(data.translation)
                      }
                      
                      // Sort results by page number
                      updatedResults.sort((a, b) => a.page_number - b.page_number)
                      
                      // Calculate progress based on completed pages vs total pages
                      const totalPages = data.total_pages || currentJob.totalPages || Math.max(...updatedResults.map(r => r.page_number))
                      const completedPages = updatedResults.length
                      
                      // Progress ranges from 10% (start) to 90% (translation complete), then 90-100% for image processing
                      const translationProgress = Math.min(90, Math.round((completedPages / totalPages) * 80) + 10)
                      
                      return {
                        ...currentJob,
                        status: 'processing',
                        progress: Math.max(translationProgress, currentJob.progress || 0),
                        results: updatedResults,
                        currentPage: data.translation.page_number,
                        totalPages: totalPages,
                        statusMessage: `Translating... ${completedPages}/${totalPages} pages completed`
                      }
                    } else if (data.type === 'complete') {
                      // Final completion message - TEXT PROCESSING DONE
                      const existingResults = currentJob.results || []
                      console.log(`🎯 Text translation complete! ${existingResults.length} pages`)
                      
                      const completedJob = {
                        ...currentJob,
                        status: 'completed' as const,
                        progress: 95, // 95% - waiting for images
                        results: existingResults,
                        metadata: data.metadata,
                        statusMessage: `Text complete! Adding images...`
                      }
                      
                      // Now check if images are ready and merge them
                      if (!imagesMerged) {
                        console.log(`📸 Checking for client-side images...`)
                        
                        // Add a small delay to let any pending image processing finish
                        setTimeout(() => {
                          imageExtractionPromise.then(async (images: any[]) => {
                            extractedImages = images || []
                            console.log(`📸 Images extracted: ${extractedImages.length} images`)
                            
                            // Merge images with results
                            const resultsWithImages = existingResults.map(result => {
                              const pageImage = extractedImages.find(img => img.pageNumber === result.page_number)
                              if (pageImage && pageImage.imageDataUrl) {
                                return {
                                  ...result,
                                  page_image: pageImage.imageDataUrl
                                }
                              }
                              return result
                            })
                            
                            const imagesAdded = resultsWithImages.filter(r => r.page_image).length
                            console.log(`✅ Images merged: ${imagesAdded}/${existingResults.length} pages have images`)
                            
                            // Update job with final results
                            setJobs(prev => prev.map(j => 
                              j.id === job.id 
                                ? { 
                                    ...j, 
                                    results: resultsWithImages,
                                    progress: 100,
                                    statusMessage: `Complete! ${existingResults.length} pages translated${imagesAdded > 0 ? ` (${imagesAdded} with images)` : ' (text-only)'}`
                                  }
                                : j
                            ))
                            imagesMerged = true
                          }).catch((imageError: any) => {
                            // Check if image extraction was cancelled
                            if (imageError instanceof Error && imageError.message.includes('cancelled')) {
                              console.log('📸 Image extraction was cancelled - completing with text-only results')
                              setJobs(prev => prev.map(j => 
                                j.id === job.id 
                                  ? { 
                                      ...j, 
                                      progress: 100,
                                      statusMessage: `Complete! ${existingResults.length} pages translated (image extraction cancelled)`
                                    }
                                  : j
                              ))
                            } else {
                              console.warn('Image extraction failed, keeping text-only results:', imageError)
                              setJobs(prev => prev.map(j => 
                                j.id === job.id 
                                  ? { 
                                      ...j, 
                                      progress: 100,
                                      statusMessage: `Complete! ${existingResults.length} pages translated (text-only)`
                                    }
                                  : j
                              ))
                            }
                            imagesMerged = true
                          })
                        }, 100) // Small delay to allow image processing to sync up
                      }
                      
                      return completedJob
                    } else if (data.type === 'error') {
                      // Error message
                      return {
                        ...currentJob,
                        status: 'error',
                        error: data.error,
                        progress: data.progress || currentJob.progress,
                        statusMessage: `Error: ${data.error}`
                      }
                    } else {
                      // Progress update
                      const existingResults = currentJob.results || []
                      const completedPages = existingResults.length
                      const totalPages = data.total_pages || currentJob.totalPages || 1
                      
                      // Calculate progress based on completed pages, with fallback to data.progress
                      let calculatedProgress = currentJob.progress || 0
                      if (totalPages > 0 && completedPages > 0) {
                        calculatedProgress = Math.min(90, Math.round((completedPages / totalPages) * 80) + 10)
                      }
                      
                      return { 
                        ...currentJob, 
                        status: data.status || currentJob.status,
                        progress: Math.max(data.progress || calculatedProgress, currentJob.progress || 0),
                        statusMessage: data.message || currentJob.statusMessage,
                        totalPages: data.total_pages || currentJob.totalPages,
                        results: data.results || currentJob.results,
                        error: data.error,
                        metadata: data.metadata || currentJob.metadata
                      }
                    }
                  }
                  return currentJob
                }))

                // If translation is completed, calculate performance (no separate image extraction needed)
                if ((data.type === 'complete' || data.status === 'completed') && data.results) {
                  const endTime = Date.now()
                  const totalTime = Math.round((endTime - startTime) / 1000)
                  const pagesCount = data.results.length
                  const timePerPage = Math.round(totalTime / pagesCount * 10) / 10
                  
                  console.log(`🎉 Translation completed for ${file.name} in ${totalTime}s for ${pagesCount} pages (${timePerPage}s per page)`)
                  console.log(`📊 Received results structure:`, {
                    total_results: data.results.length,
                    sample_result: data.results[0],
                    page_numbers: data.results.map((r: TranslationResult) => r.page_number),
                    has_images: data.results.map((r: TranslationResult) => ({ page: r.page_number, has_image: !!r.page_image && r.page_image.length > 0 }))
                  })
                  
                  // Images are already extracted by backend, no need for separate extraction
                }
              } catch (parseError) {
                console.error(`❌ Error parsing SSE data for ${file.name}:`, parseError)
                console.log('📄 Raw SSE line length:', line.length)
                console.log('📄 Raw SSE data preview:', line.substring(0, 200) + '...')
                
                // Try to extract any useful information from the malformed data
                const jsonData = line.slice(6)
                
                // Check if this looks like a completion message that got cut off
                if (jsonData.includes('"type":"complete"') || jsonData.includes('"progress":100')) {
                  console.log('🎯 Detected completion message with parsing error - treating as successful completion')
                  
                  setJobs(prev => prev.map(currentJob => {
                    if (currentJob.id === job.id) {
                      // Mark as completed using existing results (they should already be there from individual callbacks)
                      const existingResults = currentJob.results || []
                      
                      console.log(`✅ FRONTEND: Completing job with ${existingResults.length} existing results`)
                      
                      return {
                        ...currentJob,
                        status: 'completed' as const,
                        progress: 100,
                        statusMessage: `Translation complete! ${existingResults.length} pages processed.`
                      }
                    }
                    return currentJob
                  }))
                  
                  continue // Skip the rest of the error handling for this case
                }
                
                // Check if it looks like a status update
                if (jsonData.includes('"status"') && jsonData.includes('"progress"')) {
                  console.log('🔧 Attempting to recover status from malformed JSON...')
                  
                  // Try to extract status and progress with regex
                  const statusMatch = jsonData.match(/"status"\s*:\s*"([^"]+)"/)
                  const progressMatch = jsonData.match(/"progress"\s*:\s*(\d+)/)
                  const messageMatch = jsonData.match(/"message"\s*:\s*"([^"]*)"/)
                  
                  if (statusMatch || progressMatch) {
                    const recoveredData = {
                      status: statusMatch ? statusMatch[1] : 'processing',
                      progress: progressMatch ? parseInt(progressMatch[1]) : 0,
                      message: messageMatch ? messageMatch[1] : 'Processing page (data transmission error)'
                    }
                    
                    console.log('✅ Recovered partial data:', recoveredData)
                    
                    setJobs(prev => prev.map(currentJob => {
                      if (currentJob.id === job.id) {
                        return { 
                          ...currentJob, 
                          status: recoveredData.status as any,
                          progress: recoveredData.progress,
                          statusMessage: recoveredData.message || currentJob.statusMessage
                        }
                      }
                      return currentJob
                    }))
                  }
                } else {
                  // If we can't recover anything useful, just log it
                  console.log('❌ Could not recover any useful data from malformed SSE')
                }
              }
            }
          }
        }
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
              onChange={(e) => setSelectedLanguage(e.target.value)}
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
              onChange={(e) => setUserTier(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-300 focus:border-primary-300"
            >
              <option value="free">Free (50 pages, 5-page batches)</option>
              <option value="basic">Basic (100 pages, 20-page batches)</option>
              <option value="pro">Pro (500 pages, 50-page batches)</option>
              <option value="business">Business (unlimited, 75-page batches)</option>
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
                    {userTier === 'business' && 'Business tier: 10 files, unlimited pages'}
                    {userTier === 'enterprise' && 'Enterprise tier: 10 files, unlimited pages'}
                  </p>
                  {(() => {
                    const activeJobs = jobs.filter(job => 
                      job.status === 'uploading' || job.status === 'processing'
                    ).length
                    const tierLimits = {
                      free: 1,
                      basic: 2,
                      pro: 5,
                      business: 10,
                      enterprise: 10
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