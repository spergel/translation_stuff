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
  generateOriginalTranscriptionTranslationHTML,
  generateTranslationOnlyHTML,
  generateHTML
} from '../utils/htmlGenerators'

export const useDownloads = () => {

  const downloadOriginalNextToTranscription = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalNextToTranscriptionHTML(job.results, job.file.name)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.file.name.replace('.pdf', '')}-original-next-to-transcription.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadOriginalTranscriptionTranslation = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateOriginalTranscriptionTranslationHTML(job.results, job.file.name)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.file.name.replace('.pdf', '')}-all-three.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadTranslationOnly = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateTranslationOnlyHTML(job.results, job.file.name)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.file.name.replace('.pdf', '')}-translation-only.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadSideBySide = (job: TranslationJob) => {
    if (!job.results) return
    const html = generateHTML(job.results, job.file.name)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.file.name.replace('.pdf', '')}-side-by-side.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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
    downloadTranslationOnly,
    downloadSideBySide,
    
    // Bulk downloads
    downloadAllAsPDF,
    downloadAllAsHTML
  }
} 