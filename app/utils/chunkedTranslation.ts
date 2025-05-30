import { TranslationResult, TargetLanguage, UserTier } from '../types/translation'
import { extractTextFromPDF, extractImagesFromPDF } from './pdfUtils'

interface ChunkTranslationOptions {
  file: File
  targetLanguage: TargetLanguage
  userTier: UserTier
  onProgress?: (progress: number, message: string) => void
  onPageComplete?: (result: TranslationResult) => void
  signal?: AbortSignal
}

export async function processDocumentChunked(options: ChunkTranslationOptions): Promise<TranslationResult[]> {
  const { file, targetLanguage, userTier, onProgress, onPageComplete, signal } = options
  
  console.log(`🚀 Starting chunked processing for: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100} MB)`)
  
  onProgress?.(5, 'Extracting text and images from PDF...')
  
  // Process PDF entirely on client-side
  const [textData, imageData] = await Promise.all([
    extractTextFromPDF(file, { signal }),
    extractImagesFromPDF(file, { signal })
  ])
  
  if (signal?.aborted) {
    throw new Error('Processing was cancelled')
  }
  
  // Convert image array to page-indexed object
  const imagesByPage: Record<number, string> = {}
  imageData.forEach(img => {
    imagesByPage[img.pageNumber] = img.imageDataUrl
  })
  
  const totalPages = textData.pages.length
  console.log(`📄 Extracted ${totalPages} pages of text and ${Object.keys(imagesByPage).length} images`)
  
  onProgress?.(15, `Extracted content from ${totalPages} pages. Starting translation...`)
  
  const results: TranslationResult[] = []
  const concurrency = getConcurrencyForTier(userTier)
  
  console.log(`⚡ Using concurrency level: ${concurrency} (${userTier} tier)`)
  
  // Process pages in batches to respect concurrency limits
  for (let i = 0; i < totalPages; i += concurrency) {
    if (signal?.aborted) {
      throw new Error('Processing was cancelled')
    }
    
    const batch = []
    const batchEnd = Math.min(i + concurrency, totalPages)
    
    console.log(`📦 Processing batch ${Math.floor(i / concurrency) + 1}: pages ${i + 1}-${batchEnd}`)
    
    // Create batch of translation promises
    for (let pageIndex = i; pageIndex < batchEnd; pageIndex++) {
      const pageNum = pageIndex + 1
      const pageText = textData.pages[pageIndex]?.text || ''
      const pageImage = imagesByPage[pageNum] || ''
      
      if (!pageText.trim() && !pageImage) {
        console.log(`⚠️ Skipping empty page ${pageNum}`)
        continue
      }
      
      const translationPromise = translateSingleChunk({
        text: pageText,
        pageNumber: pageNum,
        targetLanguage,
        imageData: pageImage,
        totalPages,
        filename: file.name,
        signal
      })
      
      batch.push(translationPromise)
    }
    
    // Wait for batch to complete
    try {
      const batchResults = await Promise.allSettled(batch)
      
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        const pageNum = i + j + 1
        
        if (result.status === 'fulfilled') {
          results.push(result.value)
          onPageComplete?.(result.value)
          console.log(`✅ Completed page ${pageNum}/${totalPages}`)
        } else {
          console.error(`❌ Failed page ${pageNum}:`, result.reason)
          // Create error result
          const errorResult: TranslationResult = {
            page_number: pageNum,
            original_text: textData.pages[pageNum - 1]?.text || '',
            translated_text: '[Translation failed]',
            page_image: imagesByPage[pageNum] || '',
            notes: `Translation failed: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`
          }
          results.push(errorResult)
          onPageComplete?.(errorResult)
        }
      }
      
      // Update progress
      const completedPages = Math.min(batchEnd, totalPages)
      const progress = Math.round((completedPages / totalPages) * 85) + 15 // 15-100%
      onProgress?.(progress, `Completed ${completedPages}/${totalPages} pages`)
      
    } catch (error) {
      console.error(`❌ Batch processing error:`, error)
      throw error
    }
    
    // Small delay between batches to avoid overwhelming the API
    if (batchEnd < totalPages) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  // Sort results by page number
  results.sort((a, b) => a.page_number - b.page_number)
  
  onProgress?.(100, `Translation complete! Processed ${results.length} pages.`)
  console.log(`🎉 Chunked processing completed: ${results.length} pages`)
  
  return results
}

async function translateSingleChunk(params: {
  text: string
  pageNumber: number
  targetLanguage: TargetLanguage
  imageData?: string
  totalPages: number
  filename: string
  signal?: AbortSignal
}): Promise<TranslationResult> {
  const { text, pageNumber, targetLanguage, imageData, totalPages, filename, signal } = params
  
  console.log(`🔤 Translating page ${pageNumber}/${totalPages}...`)
  
  const response = await fetch('/api/translate-chunk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      pageNumber,
      targetLanguage,
      imageData,
      totalPages,
      filename
    }),
    signal
  })
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(errorData.error || `HTTP ${response.status}`)
  }
  
  const data = await response.json()
  
  if (!data.success) {
    throw new Error(data.error || 'Translation failed')
  }
  
  return data.result
}

function getConcurrencyForTier(userTier: UserTier): number {
  switch (userTier) {
    case 'free': return 1
    case 'basic': return 2
    case 'pro': return 4
    case 'enterprise': return 6
    default: return 1
  }
} 