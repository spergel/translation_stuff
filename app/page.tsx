'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Download, Eye, RotateCcw, ZoomIn, ZoomOut, Trash2, X } from 'lucide-react'
import { extractPageImage, extractImagesFromPDF } from './utils/pdfUtils'
import ClientImageExtractor from './components/ClientImageExtractor'

interface TranslationResult {
  translated_text: string
  page_number: number
  original_text?: string
  page_image?: string
  notes?: string
  layout_structure?: {
    page_type: string
    sections: {
      type: string
      content: string
      formatting: string
      position: string
    }[]
    columns: number
    has_images: boolean
    special_elements: string[]
  }
}

interface TranslationMetadata {
  document_title?: string
  total_pages?: number
  target_language?: string
}

interface TranslationJob {
  id: string
  filename: string
  status: 'uploading' | 'processing' | 'completed' | 'error' | 'extracting-images' | 'cancelled'
  progress: number
  results?: TranslationResult[]
  error?: string
  metadata?: TranslationMetadata
  originalFile?: File // Store original file for image extraction
  currentPage?: number
  totalPages?: number
  abortController?: AbortController // For cancelling ongoing requests
  statusMessage?: string
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

    // Filter valid PDF files
    const validFiles = acceptedFiles.filter(file => {
      if (file.type !== 'application/pdf') {
        alert(`Skipping "${file.name}" - Please upload only PDF files`)
        return false
      }
      return true
    })

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

  // Test function for PDF.js debugging
  const testPDFJS = async () => {
    try {
      console.log('Testing PDF.js functionality...')
      
      // Check if PDF.js is available
      const pdfjsLib = await import('pdfjs-dist')
      console.log('PDF.js imported successfully:', pdfjsLib)
      
      // Check worker setup
      console.log('Worker source:', pdfjsLib.GlobalWorkerOptions.workerSrc)
      
      // Test with a simple PDF creation
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (context) {
        canvas.width = 200
        canvas.height = 100
        context.fillStyle = 'red'
        context.fillRect(0, 0, 200, 100)
        const dataUrl = canvas.toDataURL('image/png')
        console.log('Canvas test successful, data URL length:', dataUrl.length)
      } else {
        console.error('Canvas context not available')
      }
      
    } catch (error) {
      console.error('PDF.js test failed:', error)
    }
  }

  const downloadHTML = (job: TranslationJob) => {
    if (!job.results) return

    const html = generateHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_translated.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  // New download functions for different format combinations
  const downloadOriginalNextToTranslation = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalNextToTranslationHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_original_and_translation.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadOriginalNextToTranscription = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalNextToTranscriptionHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_original_and_transcription.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadOriginalTranscriptionTranslation = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalTranscriptionTranslationHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_all_three.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadTranscriptionNextToTranslation = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateTranscriptionNextToTranslationHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_transcription_and_translation.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadTranslationOnly = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateTranslationOnlyHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_translation_only.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadOriginalImageNextToTranslation = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalImageNextToTranslationHTML(job.results, job.filename)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_image_and_translation.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPDF = async (job: TranslationJob) => {
    if (!job.results) return

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          results: job.results,
          filename: job.filename
        })
      })

      if (!response.ok) throw new Error('PDF generation failed')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.filename.replace('.pdf', '')}_translated_structured.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('Error generating PDF: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const downloadAllAsPDF = async (format?: 'transcription_translation' | 'original_translation' | 'translation_only' | 'complete_analysis') => {
    // Get all completed jobs
    const completedJobs = jobs.filter(job => 
      job.status === 'completed' && job.results && job.results.length > 0
    )

    if (completedJobs.length === 0) {
      alert('No completed translations found to download.')
      return
    }

    if (completedJobs.length > 10) {
      const confirmed = confirm(
        `You are about to download ${completedJobs.length} PDF files in a ZIP. This may take a while. Continue?`
      )
      if (!confirmed) return
    }

    try {
      console.log(`📦 Downloading ${completedJobs.length} translations as ${format || 'individual'} PDF ZIP...`)
      
      // Use different endpoint based on whether format is specified
      const endpoint = format ? '/api/download-all-side-by-side-pdfs' : '/api/download-all-pdfs'
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobs: completedJobs.map(job => ({
            id: job.id,
            filename: job.filename,
            results: job.results,
            metadata: job.metadata
          })),
          ...(format && { format })
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate PDF ZIP file')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = format 
        ? `translations_${format}_pdfs_${new Date().toISOString().split('T')[0]}.zip`
        : `translations_${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)

      console.log(`✅ Downloaded PDF ZIP with ${completedJobs.length} files${format ? ` in ${format} format` : ''}`)
      
    } catch (error) {
      console.error('Error downloading all PDFs:', error)
      alert('Error generating PDF ZIP file: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const downloadAllAsHTML = async (format: 'original_translation' | 'transcription_translation' | 'translation_only' | 'complete_analysis') => {
    // Get all completed jobs
    const completedJobs = jobs.filter(job => 
      job.status === 'completed' && job.results && job.results.length > 0
    )

    if (completedJobs.length === 0) {
      alert('No completed translations found to download.')
      return
    }

    if (completedJobs.length > 10) {
      const confirmed = confirm(
        `You are about to download ${completedJobs.length} HTML files in a ZIP. This may take a while. Continue?`
      )
      if (!confirmed) return
    }

    try {
      console.log(`📦 Downloading ${completedJobs.length} translations as ${format} HTML ZIP...`)
      
      const response = await fetch('/api/download-all-html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobs: completedJobs.map(job => ({
            id: job.id,
            filename: job.filename,
            results: job.results,
            metadata: job.metadata
          })),
          format: format
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate HTML ZIP file')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `translations_${format}_${new Date().toISOString().split('T')[0]}.zip`
      a.click()
      URL.revokeObjectURL(url)

      console.log(`✅ Downloaded HTML ZIP with ${completedJobs.length} files in ${format} format`)
      
    } catch (error) {
      console.error('Error downloading all HTML files:', error)
      alert('Error generating HTML ZIP file: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const viewSideBySide = (job: TranslationJob) => {
    if (!job.results) {
      console.error('No results available for side-by-side view')
      alert('No translation results available')
      return
    }
    
    console.log('Opening side-by-side view for:', job.filename, 'with', job.results.length, 'pages')
    
    try {
      // Open in new tab with side-by-side view
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        const html = generateSideBySideHTML(job.results, job.filename)
        console.log('Generated HTML length:', html.length)
        newWindow.document.write(html)
        newWindow.document.close()
        console.log('Side-by-side view opened successfully')
      } else {
        console.error('Failed to open new window - popup blocked?')
        alert('Failed to open new window. Please check if popups are blocked.')
      }
    } catch (error) {
      console.error('Error opening side-by-side view:', error)
      alert('Error opening view: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const previewStructuredLayout = async (job: TranslationJob) => {
    if (!job.results) return

    try {
      const response = await fetch('/api/generate-html', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          results: job.results,
          filename: job.filename
        })
      })

      if (!response.ok) throw new Error('HTML generation failed')

      const html = await response.text()
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
      }
    } catch (error) {
      alert('Error generating preview: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
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
                {/* Show Download All button only if there are completed jobs */}
                {(() => {
                  const completedJobs = jobs.filter(job => 
                    job.status === 'completed' && job.results && job.results.length > 0
                  )
                  return completedJobs.length > 0 && (
                    <div className="relative group">
                      <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                        <Download className="h-4 w-4" />
                        <span>Download All ({completedJobs.length})</span>
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {/* Dropdown Menu */}
                      <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                        <div className="py-2">
                          <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                            Download All Translations ({completedJobs.length} files):
                          </div>
                          
                          <div className="px-4 py-1 text-xs font-medium text-gray-600 bg-gray-50">
                            PDF Formats:
                          </div>
                          
                          <button
                            onClick={() => downloadAllAsPDF('transcription_translation')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium">All as Transcription + Translation PDF (ZIP)</div>
                            <div className="text-xs text-gray-500">Side-by-side PDF with transcription and translation</div>
                          </button>
                          
                          <button
                            onClick={() => downloadAllAsPDF('original_translation')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium">All as Original + Translation PDF (ZIP)</div>
                            <div className="text-xs text-gray-500">Side-by-side PDF with original images and translation</div>
                          </button>
                          
                          <button
                            onClick={() => downloadAllAsPDF('translation_only')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium">All as Translation Only PDF (ZIP)</div>
                            <div className="text-xs text-gray-500">Clean PDF with translations only</div>
                          </button>
                          
                          <button
                            onClick={() => downloadAllAsPDF('complete_analysis')}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium">All as Complete Analysis PDF (ZIP)</div>
                            <div className="text-xs text-gray-500">Original + Transcription + Translation (3 columns)</div>
                          </button>
                          
                          <div className="border-t border-gray-100 mt-2 pt-2">
                            <div className="px-4 py-1 text-xs font-medium text-gray-600 bg-gray-50">
                              HTML Formats:
                            </div>
                            
                            <button
                              onClick={() => downloadAllAsHTML('transcription_translation')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <div className="font-medium">All as Transcription + Translation HTML (ZIP)</div>
                              <div className="text-xs text-gray-500">Clean text transcription with translation side-by-side</div>
                            </button>
                            
                            <button
                              onClick={() => downloadAllAsHTML('original_translation')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <div className="font-medium">All as Side-by-Side HTML (ZIP)</div>
                              <div className="text-xs text-gray-500">Original + Translation format for all files</div>
                            </button>
                            
                            <button
                              onClick={() => downloadAllAsHTML('translation_only')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <div className="font-medium">All as Translation Only HTML (ZIP)</div>
                              <div className="text-xs text-gray-500">Clean, readable translations only</div>
                            </button>
                            
                            <button
                              onClick={() => downloadAllAsHTML('complete_analysis')}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <div className="font-medium">All as Complete Analysis HTML (ZIP)</div>
                              <div className="text-xs text-gray-500">Original + Transcription + Translation (3 columns)</div>
                            </button>
                          </div>
                          
                          <div className="border-t border-gray-100 mt-2 pt-2">
                            <button
                              onClick={() => downloadAllAsPDF()}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <div className="font-medium">All as Individual PDFs (ZIP) - Legacy</div>
                              <div className="text-xs text-gray-500">Original individual PDF format</div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
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
              <div key={job.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-6 w-6 text-primary-300" />
                    <span className="font-medium text-gray-900">{job.filename}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      job.status === 'error' ? 'bg-red-100 text-red-800' :
                      job.status === 'cancelled' ? 'bg-orange-100 text-orange-800' :
                      job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                      job.status === 'extracting-images' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {job.status === 'extracting-images' ? 'extracting images' : job.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {job.status === 'completed' && job.results && (
                      <>
                        <button
                          onClick={() => viewSideBySide(job)}
                          className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Side-by-Side</span>
                        </button>
                        <button
                          onClick={() => {
                            if (!job.results) {
                              alert('No translation results available')
                              return
                            }
                            console.log('Opening quick view for:', job.filename, 'with', job.results.length, 'pages')
                            try {
                              const html = generateHTML(job.results, job.filename)
                              console.log('Generated HTML length:', html.length)
                              const newWindow = window.open('', '_blank')
                              if (newWindow) {
                                newWindow.document.write(html)
                                newWindow.document.close()
                                console.log('Quick view opened successfully')
                              } else {
                                alert('Failed to open new window. Please check if popups are blocked.')
                              }
                            } catch (error) {
                              console.error('Error opening quick view:', error)
                              alert('Error opening view: ' + (error instanceof Error ? error.message : 'Unknown error'))
                            }
                          }}
                          className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Quick View</span>
                        </button>
                        <button
                          onClick={() => previewStructuredLayout(job)}
                          className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Preview Layout</span>
                        </button>
                        
                        {/* Download Dropdown Menu */}
                        <div className="relative group">
                          <button className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                            <Download className="h-4 w-4" />
                            <span>Download</span>
                            <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          
                          {/* Dropdown Menu */}
                          <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                            <div className="py-2">
                              <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                                Choose Download Format:
                              </div>
                              
                              <button
                                onClick={() => downloadOriginalNextToTranslation(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Original + Translation</div>
                                <div className="text-xs text-gray-500">Side-by-side comparison</div>
                              </button>
                              
                              <button
                                onClick={() => downloadOriginalImageNextToTranslation(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Original Image + Translation</div>
                                <div className="text-xs text-gray-500">Clean image with translation only</div>
                              </button>
                              
                              <button
                                onClick={() => downloadOriginalNextToTranscription(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Original + Transcription</div>
                                <div className="text-xs text-gray-500">Original text with clean transcription</div>
                              </button>
                              
                              <button
                                onClick={() => downloadOriginalTranscriptionTranslation(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Original + Transcription + Translation</div>
                                <div className="text-xs text-gray-500">Complete three-column analysis</div>
                              </button>
                              
                              <button
                                onClick={() => downloadTranscriptionNextToTranslation(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Transcription + Translation</div>
                                <div className="text-xs text-gray-500">Clean text with translation</div>
                              </button>
                              
                              <button
                                onClick={() => downloadTranslationOnly(job)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium">Translation Only</div>
                                <div className="text-xs text-gray-500">Clean, readable translation</div>
                              </button>
                              
                              <div className="border-t border-gray-100 mt-2 pt-2">
                                <button
                                  onClick={() => downloadHTML(job)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="font-medium">Legacy HTML Format</div>
                                  <div className="text-xs text-gray-500">Original format (deprecated)</div>
                                </button>
                                
                                <button
                                  onClick={() => downloadPDF(job)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                                >
                                  <div className="font-medium">Structured PDF</div>
                                  <div className="text-xs text-gray-500">PDF with layout preservation</div>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => deleteJob(job.id)}
                      className={`flex items-center space-x-1 px-3 py-2 text-white rounded-md transition-colors ${
                        job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                          ? 'bg-orange-600 hover:bg-orange-700'
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                      title={
                        job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                          ? 'Cancel translation and delete job'
                          : 'Delete this job'
                      }
                    >
                      <X className="h-4 w-4" />
                      <span>
                        {job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                          ? 'Cancel'
                          : 'Delete'
                        }
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span className="capitalize">{job.status}</span>
                    <span>
                      {job.currentPage && job.totalPages ? 
                        `Page ${job.currentPage} / ${job.totalPages}` : 
                        `${job.progress}%`
                      }
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        job.status === 'error' ? 'bg-red-500' : 
                        job.status === 'cancelled' ? 'bg-orange-500' : 
                        'bg-primary-300'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  {job.statusMessage && (
                    <div className="mt-2 text-sm text-gray-600">
                      {job.statusMessage}
                    </div>
                  )}
                </div>

                {job.error && (
                  <div className={`border rounded-md p-3 ${
                    job.status === 'cancelled' 
                      ? 'bg-orange-50 border-orange-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <p className={`text-sm ${
                      job.status === 'cancelled' 
                        ? 'text-orange-700' 
                        : 'text-red-700'
                    }`}>
                      {job.status === 'cancelled' && job.error.includes('cancelled') 
                        ? '🛑 Translation was cancelled by user. The process was stopped and cannot be resumed.'
                        : job.error
                      }
                    </p>
                  </div>
                )}

                {job.results && job.results.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-medium text-gray-900 mb-2">
                      Translation Preview ({job.results.length} pages)
                      {job.results.some(r => r.notes?.includes('error') || r.notes?.includes('failed') || r.translated_text?.includes('Could not process')) && (
                        <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                          Some pages had issues
                        </span>
                      )}
                    </h3>
                    <div className="bg-gray-50 rounded-md p-4 max-h-40 overflow-y-auto">
                      <p className="text-sm text-gray-700">
                        {job.results[0].translated_text.substring(0, 200)}...
                      </p>
                      {job.results.some(r => r.notes?.includes('error') || r.notes?.includes('failed') || r.translated_text?.includes('Could not process')) && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                          <strong>Note:</strong> Some pages encountered transmission or processing errors. 
                          These pages will show placeholder text or partial content in the final download.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function generateHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Translated: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: right;
            color: #8D6E63;
            font-size: 0.9em;
            margin-bottom: 10px;
        }
        .translation {
            white-space: pre-line;
            font-size: 1.1em;
        }
        .notes {
            font-style: italic;
            color: #707070;
            border-top: 1px dashed #ccc;
            margin-top: 15px;
            padding-top: 10px;
        }
        .character-name {
            font-weight: bold;
            color: #5D4037;
        }
        .stage-direction {
            font-style: italic;
            color: #6D4C41;
        }
    </style>
</head>
<body>
    <h1>Translated: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="translation">${formatTranslationText(page.translated_text)}</div>
        ${page.notes ? `<div class="notes">${page.notes}</div>` : ''}
    </div>
    `).join('')}
</body>
</html>`
}

function generateSideBySideHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Side-by-Side: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.2em;
            margin-bottom: 15px;
            font-weight: bold;
        }
        .comparison {
            display: flex;
            gap: 20px;
            align-items: flex-start;
        }
        .original {
            flex: 1;
            border-right: 1px solid #ddd;
            padding-right: 20px;
        }
        .translation-container {
            flex: 1;
            padding-left: 20px;
        }
        .original-content {
            background-color: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .original-text {
            white-space: pre-line;
            font-size: 0.95em;
            color: #444;
            margin-bottom: 15px;
        }
        .page-image {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .translation {
            white-space: pre-line;
            font-size: 1.1em;
            background-color: #f0f8ff;
            border: 1px solid #b0d4ff;
            border-radius: 5px;
            padding: 15px;
        }
        .notes {
            font-style: italic;
            color: #707070;
            border-top: 1px dashed #ccc;
            margin-top: 15px;
            padding-top: 10px;
        }
        .character-name {
            font-weight: bold;
            color: #5D4037;
        }
        .stage-direction {
            font-style: italic;
            color: #6D4C41;
        }
        .placeholder {
            background-color: #f5f5f5;
            border: 2px dashed #ccc;
            padding: 40px;
            text-align: center;
            color: #666;
        }
        .section-title {
            font-weight: bold;
            color: #5D4037;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <h1>Side-by-Side Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="comparison">
            <div class="original">
                <div class="section-title">Original Content</div>
                <div class="original-content">
                    ${page.original_text ? `
                        <div class="original-text">${formatTranslationText(page.original_text)}</div>
                    ` : ''}
                    ${page.page_image && page.page_image.length > 0 ? `
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Image" 
                             class="page-image" />
                    ` : `
                        <div class="placeholder">
                            Original Page ${page.page_number}
                            <br><small>(No image available)</small>
                        </div>
                    `}
                </div>
            </div>
            <div class="translation-container">
                <div class="section-title">Translation</div>
                <div class="translation">${formatTranslationText(page.translated_text)}</div>
                ${page.notes ? `<div class="notes">${page.notes}</div>` : ''}
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

function formatTranslationText(text: string): string {
  // Format dialogue and stage directions
  let formatted = text
    .replace(/([A-Za-z]+)(\s*\([^)]+\))?\n/g, '<span class="character-name">$1$2</span>\n')
    .replace(/\(([^)]+)\)/g, '<span class="stage-direction">($1)</span>')
  
  return formatted
}

// New HTML generation functions for different format combinations

function generateOriginalNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original & Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 15px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 15px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Original Document & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

function generateOriginalNextToTranscriptionHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original & Transcription: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .transcription-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 15px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .transcription-text {
            background-color: #fff8e1;
            padding: 15px;
            border-left: 4px solid #FF9800;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Original Document & Transcription: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="transcription-column">
                <div class="column-header">Transcribed Text</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

function generateOriginalTranscriptionTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original, Transcription & Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 20px;
        }
        .original-column, .transcription-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
            font-size: 0.9em;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 12px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 12px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .transcription-text {
            background-color: #fff8e1;
            padding: 12px;
            border-left: 4px solid #FF9800;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 12px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            font-size: 0.9em;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Complete Document Analysis: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="transcription-column">
                <div class="column-header">Transcribed Text</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

function generateTranscriptionNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcription & Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .transcription-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .transcription-text {
            background-color: #fff8e1;
            padding: 15px;
            border-left: 4px solid #FF9800;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 15px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Transcription & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="transcription-column">
                <div class="column-header">Transcribed Text</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

function generateTranslationOnlyHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #fefefe;
            color: #2c3e50;
        }
        h1 {
            text-align: center;
            color: #2c3e50;
            font-size: 2.2em;
            margin-bottom: 40px;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
        }
        .page {
            margin-bottom: 40px;
            padding: 30px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-left: 5px solid #3498db;
        }
        .page-number {
            color: #7f8c8d;
            font-size: 0.9em;
            font-weight: bold;
            margin-bottom: 20px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .translation {
            font-size: 1.1em;
            line-height: 1.8;
            text-align: justify;
            color: #2c3e50;
        }
        .translation p {
            margin-bottom: 1.2em;
        }
    </style>
</head>
<body>
    <h1>English Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="translation">${formatTranslationText(page.translated_text)}</div>
    </div>
    `).join('')}
</body>
</html>`
}

function generateOriginalImageNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original Image & Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 15px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 15px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Original Image & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
} 