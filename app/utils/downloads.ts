import { TranslationJob, TranslationResult } from '../types/translation'
import { generateHTML, generateTranslationOnlyHTML } from './htmlGenerators'

export class DownloadsManager {
  async downloadPDF(job: TranslationJob, translationOnly = false): Promise<void> {
    if (!job.results || job.results.length === 0) return

    try {
      // For authenticated users with documentId, use the Firebase-generated PDF
      if (job.documentId) {
        try {
          // First try to get the document to see if it has a direct download URL
          const docResponse = await fetch(`/api/documents/${job.documentId}`)
          if (docResponse.ok) {
            const docData = await docResponse.json()
            const downloadUrl = docData.document?.translatedFileUrl
            
            if (downloadUrl) {
              // Use the direct download URL from Firebase Storage
              const link = document.createElement('a')
              link.href = downloadUrl
              link.download = `${job.file.name}_translated.pdf`
              link.target = '_blank' // Open in new tab to handle CORS
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              return
            }
          }
        } catch (docError) {
          console.warn('Could not fetch document data, trying download API:', docError)
        }
        
        // Fallback to download API
        const downloadLink = `/api/documents/${job.documentId}/download?format=pdf&translationOnly=${translationOnly}`
        const link = document.createElement('a')
        link.href = downloadLink
        link.download = `${job.file.name}_${translationOnly ? 'translation' : 'translated'}.pdf`
        link.target = '_blank'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }

      // For anonymous users, PDF generation is not supported in production
      // Fall back to HTML download immediately
      console.warn('PDF generation for anonymous users not supported in production environment, using HTML instead')
      await this.downloadHTML(job, translationOnly)
      return
    } catch (error) {
      console.error('Error downloading PDF:', error)
      
      // Fallback to HTML download
      console.warn('PDF download failed, falling back to HTML download')
      try {
        await this.downloadHTML(job, translationOnly)
      } catch (htmlError) {
        console.error('HTML fallback also failed:', htmlError)
        throw error
      }
    }
  }

  async downloadHTML(job: TranslationJob, translationOnly = false): Promise<void> {
    if (!job.results || job.results.length === 0) return
    
    const html = translationOnly
      ? generateTranslationOnlyHTML(job.results, job.file.name)
      : generateHTML(job.results, job.file.name)
    
    const blob = new Blob([html], { type: 'text/html' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${job.file.name}_${translationOnly ? 'translation' : 'translated'}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  viewSideBySide(job: TranslationJob): void {
    if (!job.results || job.results.length === 0) return
    
    const html = generateHTML(job.results, job.file.name)
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.write(html)
      newWindow.document.close()
    }
  }



  async downloadAll(jobs: TranslationJob[], format: 'pdf' | 'html'): Promise<void> {
    const completedJobs = jobs.filter(job => job.status === 'completed' && job.results && job.results.length > 0)
    
    if (completedJobs.length === 0) {
      throw new Error('No completed jobs to download')
    }

    for (const job of completedJobs) {
      try {
        if (format === 'pdf') {
          await this.downloadPDF(job)
        } else {
          await this.downloadHTML(job)
        }
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`Failed to download ${job.file.name}:`, error)
      }
    }
  }
}

export const downloadsManager = new DownloadsManager() 