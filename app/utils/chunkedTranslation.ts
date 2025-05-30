import { TranslationResult, TargetLanguage, UserTier } from '../types/translation'
import { extractImagesFromPDF } from './pdfUtils'

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
  
  console.log(`🚀 Starting image-based processing for: ${file.name} (${Math.round(file.size / 1024 / 1024 * 100) / 100} MB)`)
  
  onProgress?.(5, 'Extracting images from PDF for Gemini image understanding...')
  
  // Process PDF using only image extraction (since text extraction failed)
  const imageData = await extractImagesFromPDF(file, { signal })
  
  if (signal?.aborted) {
    throw new Error('Processing was cancelled')
  }
  
  // Convert image array to page-indexed object
  const imagesByPage: Record<number, string> = {}
  imageData.forEach(img => {
    imagesByPage[img.pageNumber] = img.imageDataUrl
  })
  
  const totalPages = imageData.length
  console.log(`📸 Extracted ${totalPages} images for direct Gemini processing`)
  
  if (totalPages === 0) {
    throw new Error('No images could be extracted from the PDF')
  }
  
  onProgress?.(15, `Extracted ${totalPages} images. Starting direct image translation with Gemini...`)
  
  const results: TranslationResult[] = []
  const concurrency = getConcurrencyForTier(userTier)
  
  console.log(`⚡ Using concurrency level: ${concurrency} (${userTier} tier)`)
  console.log(`🖼️ Processing images directly with Gemini's native image understanding`)
  
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
      const imageInfo = imageData[pageIndex]
      if (!imageInfo) {
        console.log(`⚠️ No image data for page ${pageIndex + 1}`)
        continue
      }
      
      const pageNum = imageInfo.pageNumber
      const pageImage = imageInfo.imageDataUrl
      
      if (!pageImage) {
        console.log(`⚠️ Skipping empty page ${pageNum}`)
        continue
      }
      
      const translationPromise = translateImageDirectly({
        imageData: pageImage,
        pageNumber: pageNum,
        targetLanguage,
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
        const imageInfo = imageData[i + j]
        const pageNum = imageInfo?.pageNumber || (i + j + 1)
        
        if (result.status === 'fulfilled') {
          results.push(result.value)
          onPageComplete?.(result.value)
          console.log(`✅ Completed page ${pageNum}/${totalPages}`)
        } else {
          console.error(`❌ Failed page ${pageNum}:`, result.reason)
          // Create error result
          const errorResult: TranslationResult = {
            page_number: pageNum,
            original_text: '[Image processing failed]',
            translated_text: '[Translation failed]',
            page_image: imageInfo?.imageDataUrl || '',
            notes: `Image translation failed: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`
          }
          results.push(errorResult)
          onPageComplete?.(errorResult)
        }
      }
      
      // Update progress
      const completedPages = Math.min(batchEnd, totalPages)
      const progress = Math.round((completedPages / totalPages) * 85) + 15 // 15-100%
      onProgress?.(progress, `Completed ${completedPages}/${totalPages} pages using Gemini image understanding`)
      
    } catch (error) {
      console.error(`❌ Batch processing error:`, error)
      throw error
    }
    
    // Small delay between batches to avoid overwhelming the API
    if (batchEnd < totalPages) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  
  // Sort results by page number
  results.sort((a, b) => a.page_number - b.page_number)
  
  onProgress?.(100, `Image translation complete! Processed ${results.length} pages using Gemini's native image understanding.`)
  console.log(`🎉 Image-based processing completed: ${results.length} pages`)
  
  return results
}

async function translateImageDirectly(params: {
  imageData: string
  pageNumber: number
  targetLanguage: TargetLanguage
  totalPages: number
  filename: string
  signal?: AbortSignal
}): Promise<TranslationResult> {
  const { imageData, pageNumber, targetLanguage, totalPages, filename, signal } = params
  
  console.log(`🖼️ Processing image directly with Gemini for page ${pageNumber}/${totalPages}...`)
  
  const response = await fetch('/api/translate-chunk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: '', // No pre-extracted text - let Gemini read the image
      pageNumber,
      targetLanguage,
      imageData,
      totalPages,
      filename,
      imageOnly: true // Flag to indicate this is image-only processing
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
    case 'pro': return 3  // Slightly reduced for image processing
    case 'enterprise': return 4  // Reduced for image processing
    default: return 1
  }
} 