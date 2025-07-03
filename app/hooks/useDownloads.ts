import { TranslationJob } from '../types/translation'
import { downloadsManager } from '../utils/downloads'

export function useDownloads() {
  return {
    downloadPDF: (job: TranslationJob, translationOnly = false) => 
      downloadsManager.downloadPDF(job, translationOnly),
    
    downloadHTML: (job: TranslationJob, translationOnly = false) => 
      downloadsManager.downloadHTML(job, translationOnly),
    
    viewSideBySide: (job: TranslationJob) => 
      downloadsManager.viewSideBySide(job),
    
    downloadAll: (jobs: TranslationJob[], format: 'pdf' | 'html') => 
      downloadsManager.downloadAll(jobs, format),
  }
} 