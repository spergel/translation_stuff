import { TranslationResult, TranslationJob } from '../types/translation'
import { generateSideBySideHTML, generateHTML, formatTranslationText } from './htmlGenerators'

// Download functions
export const downloadHTML = (job: TranslationJob) => {
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

export const downloadPDF = async (job: TranslationJob) => {
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

// Utility function to wait for images to be available
export const waitForImages = (
  job: TranslationJob, 
  maxWaitTime: number = 10000,
  getLatestJob?: () => TranslationJob
): Promise<TranslationJob> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let pollCount = 0
    
    const checkImages = () => {
      pollCount++
      
      // Use the latest job state if available, otherwise use the passed job
      const currentJob = getLatestJob ? getLatestJob() : job
      const pagesWithImages = currentJob.results?.filter(r => r.page_image && r.page_image.length > 0).length || 0
      const totalPages = currentJob.results?.length || 0
      
      console.log(`🕐 Waiting for images (attempt ${pollCount})... ${pagesWithImages}/${totalPages} pages have images`)
      
      // Success conditions:
      // 1. Some images are available (at least 30% of pages have images)
      // 2. Or we've waited long enough and have at least some images
      // 3. Or we've hit the maximum wait time
      const hasSignificantImages = pagesWithImages > 0 && (pagesWithImages / totalPages) >= 0.3
      const hasAnyImages = pagesWithImages > 0
      const hasWaitedReasonably = Date.now() - startTime > 3000 // 3 seconds minimum
      const hasWaitedTooLong = Date.now() - startTime > maxWaitTime
      
      if (hasSignificantImages || (hasWaitedReasonably && hasAnyImages) || hasWaitedTooLong) {
        const waitTime = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`✅ Done waiting for images after ${waitTime}s: ${pagesWithImages}/${totalPages} pages have images`)
        resolve(currentJob) // Return the current job (which might be updated)
      } else {
        // Continue waiting, check more frequently initially, then less frequently
        const delay = pollCount < 20 ? 150 : 500 // 150ms for first 3 seconds, then 500ms
        setTimeout(checkImages, delay)
      }
    }
    
    checkImages()
  })
}

export const viewSideBySide = (job: TranslationJob) => {
  if (!job.results) {
    console.error('No results available for side-by-side view')
    alert('No translation results available')
    return
  }
  
  console.log('Opening side-by-side view for:', job.filename, 'with', job.results.length, 'pages')
  
  // DEBUG: Check image status when side-by-side is called
  const pagesWithImages = job.results.filter(r => r.page_image && r.page_image.length > 0).length
  console.log(`🖼️ DEBUG: Side-by-side called with ${pagesWithImages}/${job.results.length} pages having images`)
  console.log(`🖼️ DEBUG: Sample page image status:`, {
    page1: { 
      hasImage: !!job.results[0]?.page_image,
      imageLength: job.results[0]?.page_image?.length || 0,
      imagePreview: job.results[0]?.page_image?.substring(0, 50) || 'none'
    },
    lastPage: {
      hasImage: !!job.results[job.results.length-1]?.page_image,
      imageLength: job.results[job.results.length-1]?.page_image?.length || 0,
      imagePreview: job.results[job.results.length-1]?.page_image?.substring(0, 50) || 'none'
    }
  })
  
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

export const downloadAllAsPDF = async (jobs: TranslationJob[], format?: 'transcription_translation' | 'original_translation' | 'translation_only' | 'complete_analysis') => {
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

export const downloadAllAsHTML = async (jobs: TranslationJob[], format: 'original_translation' | 'transcription_translation' | 'translation_only' | 'complete_analysis') => {
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