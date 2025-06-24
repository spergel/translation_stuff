export type TargetLanguage = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'russian' | 'chinese' | 'japanese' | 'korean'

export type UserTier = 'free' | 'pro' | 'enterprise'

export interface TranslationResult {
  page_number: number
  translation: string
  page_image?: string
  pdfUrl?: string
  htmlUrl?: string
}

export interface TranslationJob {
  id: string
  file: {
    name: string
    type: string
    size: number
    blobUrl: string
  }
  status: 'processing' | 'completed' | 'error' | 'cancelled' | 'uploading' | 'queued'
  progress: number
  results?: TranslationResult[]
  error?: string
  statusMessage?: string
  syncing?: boolean
  targetLanguage: TargetLanguage
  createdAt: string
  updatedAt: string
  queueJobId?: string
}

export interface TranslationMetadata {
  document_title?: string
  total_pages?: number
  target_language?: string
}

export interface TranslationJob {
  id: string
  file: {
    name: string
    type: string
    size: number
    blobUrl: string
  }
  status: 'queued' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled'
  progress: number
  results?: TranslationResult[]
  error?: string
  currentPage?: number
  totalPages?: number
  abortController?: AbortController
  metadata?: TranslationMetadata
  statusMessage?: string
  documentId?: string
  translatedPdfUrl?: string
  translatedHtmlUrl?: string
  syncing?: boolean
  createdAt: string
  targetLanguage: TargetLanguage
  queueJobId?: string
} 