import { TranslationJob } from '../types/translation'
import { 
  downloadHTML, 
  downloadPDF, 
  viewSideBySide, 
  downloadAllAsPDF, 
  downloadAllAsHTML 
} from '../utils/downloads'
import {
  generateOriginalNextToTranslationHTML,
  generateOriginalNextToTranscriptionHTML,
  generateOriginalTranscriptionTranslationHTML,
  generateTranscriptionNextToTranslationHTML,
  generateTranslationOnlyHTML,
  generateOriginalImageNextToTranslationHTML
} from '../utils/htmlGenerators'

export const useDownloads = () => {
  
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

  return {
    // Basic downloads
    downloadHTML,
    downloadPDF,
    viewSideBySide,
    
    // Format-specific downloads
    downloadOriginalNextToTranslation,
    downloadOriginalNextToTranscription,
    downloadOriginalTranscriptionTranslation,
    downloadTranscriptionNextToTranslation,
    downloadTranslationOnly,
    downloadOriginalImageNextToTranslation,
    
    // Bulk downloads
    downloadAllAsPDF,
    downloadAllAsHTML,
    
    // Preview
    previewStructuredLayout
  }
} 