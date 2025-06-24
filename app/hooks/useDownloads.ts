import { TranslationJob } from '../types/translation'
import { generateHTML, generateTranslationOnlyHTML } from '../utils/htmlGenerators'

export function useDownloads() {
  const downloadPDF = async (job: TranslationJob, translationOnly = false) => {
    if (!job.results || job.results.length === 0) return

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results: job.results,
          filename: job.file.name,
          translationOnly,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to generate PDF: ${response.statusText}`)
      }

      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `${job.file.name}_${translationOnly ? 'translation' : 'translated'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      // You might want to show a notification to the user here
    }
  }

  const downloadHTML = async (job: TranslationJob, translationOnly = false) => {
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

  const downloadAllAsPDF = async (jobs: TranslationJob[], translationOnly = false) => {
    const completedJobs = jobs.filter(
      (job) => job.status === 'completed' && job.results && job.results.length > 0
    )
    for (const job of completedJobs) {
      await downloadPDF(job, translationOnly)
    }
  }

  const downloadAllAsHTML = async (jobs: TranslationJob[], translationOnly = false) => {
    const completedJobs = jobs.filter(
      (job) => job.status === 'completed' && job.results && job.results.length > 0
    )
    for (const job of completedJobs) {
      await downloadHTML(job, translationOnly)
    }
  }

  const openTranslationOnly = (job: TranslationJob) => {
    if (!job.results || job.results.length === 0) return
    const html = generateTranslationOnlyHTML(job.results, job.file.name)
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.write(html)
      newWindow.document.close()
    }
  }

  const waitForImages = async (
    job: TranslationJob, 
    timeout: number,
    getLatestJob: () => TranslationJob
  ): Promise<TranslationJob> => {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      const currentJob = getLatestJob()
      const hasAllImages = currentJob.results?.every(r => r.page_image)
      if (hasAllImages) {
        return currentJob
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return getLatestJob()
  }

  const viewSideBySide = (job: TranslationJob) => {
    if (!job.results || job.results.length === 0) return
    const html = generateHTML(job.results, job.file.name)
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      newWindow.document.write(html)
      newWindow.document.close()
    }
  }

  return {
    downloadPDF,
    downloadHTML,
    downloadAllAsPDF,
    downloadAllAsHTML,
    openTranslationOnly,
    waitForImages,
    viewSideBySide
  }
} 