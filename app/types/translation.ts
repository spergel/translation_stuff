export interface TranslationResult {
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

export type UserTier = 'free' | 'basic' | 'pro' | 'enterprise'

export type TargetLanguage = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'russian' | 'chinese' | 'japanese' | 'korean' 