import { TranslationJob } from '../types/translation'
import { 
  downloadHTML, 
  downloadPDF, 
  viewSideBySide, 
  downloadAllAsPDF, 
  downloadAllAsHTML,
  waitForImages
} from '../utils/downloads'
import {
  generateOriginalNextToTranscriptionHTML,
  generateOriginalTranscriptionTranslationHTML
} from '../utils/htmlGenerators'

export const useDownloads = () => {

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

  return {
    // Basic downloads - only what we use
    downloadHTML,
    downloadPDF,
    viewSideBySide,
    waitForImages,
    
    // Format-specific downloads that user wants to keep
    downloadOriginalNextToTranscription,
    downloadOriginalTranscriptionTranslation,
    
    // Bulk downloads
    downloadAllAsPDF,
    downloadAllAsHTML
  }
} 