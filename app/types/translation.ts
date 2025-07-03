export type TargetLanguage = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'russian' | 'chinese' | 'japanese' | 'korean'

export type UserTier = 'free' | 'pro' | 'enterprise'

export interface ChapterInfo {
  page_number: number
  title: string
  position: 'top' | 'middle' | 'bottom'
  confidence: number // 0-1, how confident the AI is about this being a chapter
}

export interface TranslationResult {
  page_number: number
  original_text: string  // Extracted/transcribed text from the image
  translation: string   // AI translation of the extracted text
  pdfUrl?: string
  htmlUrl?: string
  isChapterStart?: boolean // Whether this page starts a new chapter
  chapterInfo?: ChapterInfo // Chapter details if this page starts a chapter
}

export interface TranslationMetadata {
  document_title?: string
  total_pages?: number
  target_language?: string
  userTier?: UserTier
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
  updatedAt: string
  targetLanguage: TargetLanguage
} 