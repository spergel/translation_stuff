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
  statusMessage?: string // Detailed status message for better UX
}

export type UserTier = 'free' | 'basic' | 'pro' | 'enterprise'

export type TargetLanguage = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'russian' | 'chinese' | 'japanese' | 'korean' 