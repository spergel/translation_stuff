'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Trash2 } from 'lucide-react'
import { extractImagesFromPDF } from './utils/pdfUtils'
import { TranslationResult, TranslationJob, TranslationMetadata } from './types/translation'
import JobItem from './components/JobItem'
import DownloadAllButton from './components/DownloadAllButton'

// Test function for PDF.js debugging
const testPDFJS = async () => {
  try {
    console.log('Testing PDF.js functionality...')
    
    // Check if PDF.js is available
    const pdfjsLib = await import('pdfjs-dist')
    console.log('PDF.js imported successfully:', pdfjsLib)
    
    // Check worker setup
    console.log('Worker source:', pdfjsLib.GlobalWorkerOptions.workerSrc)
    
    // Test worker availability
    try {
      const testResponse = await fetch(pdfjsLib.GlobalWorkerOptions.workerSrc)
      console.log('Worker file accessible:', testResponse.ok, testResponse.status)
    } catch (workerError) {
      console.error('Worker file not accessible:', workerError)
    }
    
    // Test with a simple PDF creation
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context) {
      canvas.width = 200
      canvas.height = 100
      context.fillStyle = 'white'
      context.fillRect(0, 0, 200, 100)
      context.fillStyle = 'red'
      context.fillRect(10, 10, 50, 50)
      context.fillStyle = 'black'
      context.font = '16px Arial'
      context.fillText('Test', 70, 40)
      
      const dataUrl = canvas.toDataURL('image/png')
      console.log('Canvas test successful, data URL length:', dataUrl.length)
      
      // Display the test image
      const img = document.createElement('img')
      img.src = dataUrl
      img.style.position = 'fixed'
      img.style.top = '10px'
      img.style.right = '10px'
      img.style.zIndex = '9999'
      img.style.border = '2px solid red'
      document.body.appendChild(img)
      
      setTimeout(() => document.body.removeChild(img), 3000)
      
    } else {
      console.error('Canvas context not available')
    }
    
    // Test PDF.js configuration
    console.log('PDF.js configuration test complete')
    alert('PDF.js test completed! Check console for detailed results.')
    
  } catch (error) {
    console.error('PDF.js test failed:', error)
    alert(`PDF.js test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export default function Home() {
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState('english')
  const [userTier, setUserTier] = useState('free')

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Check file limits based on tier
    const tierConfig = {
      free: { maxFiles: 1, maxPages: 20 },
      basic: { maxFiles: 2, maxPages: 100 },
      pro: { maxFiles: 5, maxPages: 500 },
      enterprise: { maxFiles: 10, maxPages: -1 }
    }
    
    const currentTierConfig = tierConfig[userTier as keyof typeof tierConfig] || tierConfig.free
    const currentActiveJobs = jobs.filter(job => 
      job.status === 'uploading' || job.status === 'processing' || job.status === 'extracting-images'
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
      
      // Warn about large files
      const fileSizeMB = Math.round(file.size / 1024 / 1024 * 100) / 100
      if (fileSizeMB > 50) {
        const proceed = confirm(`"${file.name}" is ${fileSizeMB}MB. Large PDFs may take longer to process and may timeout on free tier. Continue?`)
        if (!proceed) return false
      }
      
      return true
    })

    // Quick page count estimation for user awareness
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
            free: `"${file.name}" has ${pageCount} pages. Free tier is limited to 20 pages and may timeout. Consider upgrading or splitting the document.`,
            basic: `"${file.name}" has ${pageCount} pages. This will be processed in batches of 20 pages for optimal performance.`,
            pro: `"${file.name}" has ${pageCount} pages. This will be processed in batches of 40 pages for optimal performance.`,
            enterprise: `"${file.name}" has ${pageCount} pages. This will be processed in batches of 100 pages for optimal performance.`
          }
          
          const message = tierMessages[userTier as keyof typeof tierMessages] || tierMessages.free
          
          if (userTier === 'free' && pageCount > currentTierConfig.maxPages) {
            alert(message + `\n\nOnly the first ${currentTierConfig.maxPages} pages will be processed.`)
          } else {
            const proceed = confirm(message + `\n\nProceed with processing?`)
            if (!proceed) return
          }
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
        status: 'extracting-images', // Start with image extraction
        progress: 0,
        originalFile: file,
        abortController,
        statusMessage: 'Extracting PDF images...'
      }
    })

    // Add all jobs to state immediately so they show up
    setJobs(prev => [...prev, ...newJobs])

    // Now process each file
    for (let i = 0; i < newJobs.length; i++) {
      const job = newJobs[i]
      const file = validFiles[i]

      console.log(`📄 Starting processing for: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100} MB)`)

      try {
        // Step 1: Extract images using client-side PDF.js
        console.log(`🖼️ Extracting images for ${file.name}...`)
        setJobs(prev => prev.map(j => j.id === job.id ? { 
          ...j, 
          status: 'extracting-images', 
          progress: 10,
          statusMessage: 'Extracting PDF images using client-side PDF.js...'
        } : j))

        const extractedImages = await extractImagesFromPDF(file)
        
        console.log(`✅ Extracted ${extractedImages.length} images for ${file.name}`)
        setJobs(prev => prev.map(j => j.id === job.id ? { 
          ...j, 
          progress: 30,
          statusMessage: `Extracted ${extractedImages.length} images, starting translation...`
        } : j))

        // Step 2: Send to API with pre-extracted images
        setJobs(prev => prev.map(j => j.id === job.id ? { 
          ...j, 
          status: 'uploading',
          progress: 35,
          statusMessage: 'Uploading file and images to server...'
        } : j))

        const formData = new FormData()
        formData.append('file', file)
        formData.append('targetLanguage', selectedLanguage)
        formData.append('userTier', userTier)
        
        // Add pre-extracted images
        if (extractedImages.length > 0) {
          formData.append('preExtractedImages', JSON.stringify(extractedImages))
          console.log(`📸 Sending ${extractedImages.length} pre-extracted images to server`)
        }

        const response = await fetch('/api/translate', {
          method: 'POST',
          body: formData,
          signal: job.abortController?.signal
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Translation failed')
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const startTime = Date.now()

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
                
                // Check for obvious truncation issues
                if (jsonData.length > 50000) {
                  console.warn('⚠️ Very large SSE data detected, might be truncated:', jsonData.length, 'chars')
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
                    // Handle different message types from the new backend
                    if (data.type === 'translation' && data.translation) {
                      // Individual translation result - add to existing results
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
                      
                      // Calculate better progress based on completed pages
                      const completedPages = updatedResults.length
                      const totalPages = currentJob.totalPages || data.translation.page_number
                      const calculatedProgress = Math.min(95, Math.round((completedPages / totalPages) * 90) + 5)
                      
                      return {
                        ...currentJob,
                        status: 'processing',
                        progress: Math.max(calculatedProgress, data.progress || currentJob.progress),
                        results: updatedResults,
                        currentPage: data.translation.page_number,
                        totalPages: totalPages,
                        statusMessage: `Completed ${completedPages}/${totalPages} pages${data.message ? ` - ${data.message}` : ''}`
                      }
                    } else if (data.type === 'complete') {
                      // Final completion message (lightweight)
                      console.log(`🎯 FRONTEND: Received completion message for ${file.name}`, {
                        type: data.type,
                        resultsCount: data.resultsCount,
                        hasResults: data.hasResults,
                        progress: data.progress,
                        metadata: data.metadata
                      })
                      return {
                        ...currentJob,
                        status: 'completed',
                        progress: 100,
                        results: currentJob.results || [], // Keep existing results if no new ones provided
                        metadata: data.metadata,
                        statusMessage: `Translation complete! ${data.resultsCount || (currentJob.results || []).length} pages processed.`
                      }
                    } else if (data.type === 'results') {
                      // Full results data (separate message)
                      console.log(`📦 FRONTEND: Received full results for ${file.name}`, {
                        type: data.type,
                        resultsCount: data.results?.length
                      })
                      return {
                        ...currentJob,
                        results: data.results || currentJob.results
                      }
                    } else if (data.type === 'result') {
                      // Individual result from batch processing
                      console.log(`📄 FRONTEND: Received individual result for page ${data.result?.page_number} of ${file.name}`)
                      
                      // DEBUG: Log image data details
                      const result = data.result
                      if (result) {
                        console.log(`🖼️ Page ${result.page_number} image debug:`)
                        console.log(`   - has page_image property: ${!!result.page_image}`)
                        console.log(`   - page_image type: ${typeof result.page_image}`)
                        console.log(`   - page_image length: ${result.page_image ? result.page_image.length : 'N/A'}`)
                        console.log(`   - page_image starts with data: ${result.page_image ? result.page_image.startsWith('data:') : 'N/A'}`)
                        console.log(`   - page_image first 50 chars: ${result.page_image ? result.page_image.substring(0, 50) : 'N/A'}`)
                        console.log(`   - Result object keys:`, Object.keys(result))
                      }
                      
                      const existingResults = currentJob.results || []
                      const updatedResults = [...existingResults]
                      
                      // Check if this page already exists and update it, or add new
                      const existingIndex = updatedResults.findIndex(r => r.page_number === data.result.page_number)
                      if (existingIndex >= 0) {
                        updatedResults[existingIndex] = data.result
                      } else {
                        updatedResults.push(data.result)
                      }
                      
                      // Sort results by page number
                      updatedResults.sort((a, b) => a.page_number - b.page_number)
                      
                      return {
                        ...currentJob,
                        results: updatedResults
                      }
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
                      // Legacy format or progress update
                      let currentPage = currentJob.currentPage
                      let totalPages = currentJob.totalPages
                      let statusMessage = data.message || `${data.status || currentJob.status} - ${data.progress || currentJob.progress}%`
                      
                      // Extract page information from message
                      if (data.message) {
                        // Look for "Found X pages" pattern
                        const foundPagesMatch = data.message.match(/Found (\d+) pages/i)
                        if (foundPagesMatch) {
                          totalPages = parseInt(foundPagesMatch[1])
                          statusMessage = `Found ${totalPages} pages. Starting translation...`
                        }
                        
                        // Look for "page X of Y" or "Processing page X" patterns
                        const pageMatch = data.message.match(/(?:page|Processing page)\s+(\d+)(?:\s+of\s+(\d+))?/i)
                        if (pageMatch) {
                          currentPage = parseInt(pageMatch[1])
                          if (pageMatch[2]) {
                            totalPages = parseInt(pageMatch[2])
                          }
                          statusMessage = data.message
                        }
                        
                        // Look for more specific status messages
                        if (data.message.includes('Starting page')) {
                          statusMessage = data.message
                        } else if (data.message.includes('Translating page')) {
                          statusMessage = data.message
                        } else if (data.message.includes('Extracting image')) {
                          statusMessage = data.message
                        } else if (data.message.includes('complete')) {
                          statusMessage = data.message
                        }
                      }
                      
                      // Better progress calculation for overall job
                      let calculatedProgress = data.progress || currentJob.progress
                      if (currentPage && totalPages && currentPage <= totalPages) {
                        calculatedProgress = Math.min(95, Math.round((currentPage / totalPages) * 90) + 5)
                      }
                      
                      return { 
                        ...currentJob, 
                        status: data.status || currentJob.status,
                        progress: Math.max(calculatedProgress, currentJob.progress), // Don't go backwards
                        currentPage,
                        totalPages,
                        results: data.results || currentJob.results,
                        error: data.error,
                        metadata: data.metadata || currentJob.metadata,
                        statusMessage
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
                          error: currentJob.error || 'Some pages may have transmission errors'
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
        `This translation is currently ${job.status}. Are you sure you want to cancel it?`
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
      job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
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
              <option value="free">Free (20 pages, sequential)</option>
              <option value="basic">Basic (100 pages, 20-page batches)</option>
              <option value="pro">Pro (500 pages, 40-page batches)</option>
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
                    {userTier === 'free' && 'Free tier: 1 file, 20 pages max'}
                    {userTier === 'basic' && 'Basic tier: 2 files, 100 pages each'}
                    {userTier === 'pro' && 'Pro tier: 5 files, 500 pages each'}
                    {userTier === 'enterprise' && 'Enterprise tier: 10 files, unlimited pages'}
                  </p>
                  {(() => {
                    const activeJobs = jobs.filter(job => 
                      job.status === 'uploading' || job.status === 'processing' || job.status === 'extracting-images'
                    ).length
                    const tierLimits = {
                      free: 1,
                      basic: 2,
                      pro: 5,
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
              <div className="flex space-x-2">
                <DownloadAllButton jobs={jobs} />
                <button
                  onClick={testPDFJS}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <span>Test PDF.js</span>
                </button>
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
              <JobItem key={job.id} job={job} onDelete={deleteJob} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 