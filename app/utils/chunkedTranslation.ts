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
  const maxParallelBatches = getMaxParallelBatches(userTier) // New: multiple batches in parallel
  
  console.log(`⚡ Using concurrency level: ${concurrency} pages per batch (${userTier} tier)`)
  console.log(`🚀 Running ${maxParallelBatches} batches in parallel for maximum speed`)
  console.log(`🖼️ Processing images directly with Gemini's structured output (no commentary)`)
  
  // Create all batches first
  const allBatches: Array<{
    batchIndex: number
    pageIndices: number[]
    startPage: number
    endPage: number
  }> = []
  
  for (let i = 0; i < totalPages; i += concurrency) {
    const batchEnd = Math.min(i + concurrency, totalPages)
    const pageIndices = []
    
    for (let pageIndex = i; pageIndex < batchEnd; pageIndex++) {
      const imageInfo = imageData[pageIndex]
      if (imageInfo?.imageDataUrl) {
        pageIndices.push(pageIndex)
      }
    }
    
    if (pageIndices.length > 0) {
      allBatches.push({
        batchIndex: Math.floor(i / concurrency),
        pageIndices,
        startPage: i + 1,
        endPage: batchEnd
      })
    }
  }
  
  console.log(`📦 Created ${allBatches.length} batches total, processing ${maxParallelBatches} at a time`)
  
  // Process batches in parallel groups
  for (let batchGroupStart = 0; batchGroupStart < allBatches.length; batchGroupStart += maxParallelBatches) {
    if (signal?.aborted) {
      throw new Error('Processing was cancelled')
    }
    
    const batchGroup = allBatches.slice(batchGroupStart, batchGroupStart + maxParallelBatches)
    console.log(`🏃‍♂️ Processing batch group ${Math.floor(batchGroupStart / maxParallelBatches) + 1}: batches ${batchGroup.map(b => b.batchIndex + 1).join(', ')}`)
    
    // Process all batches in this group in parallel
    const batchPromises = batchGroup.map(async (batch) => {
      console.log(`📦 Starting batch ${batch.batchIndex + 1}: pages ${batch.startPage}-${batch.endPage}`)
      
      // Process all pages in this batch
      const pagePromises = batch.pageIndices.map(async (pageIndex) => {
        const imageInfo = imageData[pageIndex]
        const pageNum = imageInfo.pageNumber
        
        return translateImageDirectly({
          imageData: imageInfo.imageDataUrl,
          pageNumber: pageNum,
          targetLanguage,
          totalPages,
          filename: file.name,
          signal
        })
      })
      
      // Wait for all pages in this batch
      const batchResults = await Promise.allSettled(pagePromises)
      
      // Process results
      const batchSuccesses: TranslationResult[] = []
      const batchErrors: TranslationResult[] = []
      
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]
        const pageIndex = batch.pageIndices[i]
        const imageInfo = imageData[pageIndex]
        const pageNum = imageInfo.pageNumber
        
        if (result.status === 'fulfilled') {
          batchSuccesses.push(result.value)
          console.log(`✅ Batch ${batch.batchIndex + 1}: Completed page ${pageNum}/${totalPages}`)
        } else {
          console.error(`❌ Batch ${batch.batchIndex + 1}: Failed page ${pageNum}:`, result.reason)
          const errorResult: TranslationResult = {
            page_number: pageNum,
            original_text: '[Image processing failed]',
            translated_text: '[Translation failed]',
            page_image: imageInfo?.imageDataUrl || '',
            notes: `Image translation failed: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`
          }
          batchErrors.push(errorResult)
        }
      }
      
      console.log(`🎯 Batch ${batch.batchIndex + 1} complete: ${batchSuccesses.length} success, ${batchErrors.length} errors`)
      return [...batchSuccesses, ...batchErrors]
    })
    
    // Wait for all batches in this group to complete
    try {
      const groupResults = await Promise.all(batchPromises)
      
      // Flatten and add results
      const groupFlattened = groupResults.flat()
      results.push(...groupFlattened)
      
      // Update progress based on completed pages
      const completedPages = results.length
      const progress = Math.round((completedPages / totalPages) * 85) + 15 // 15-100%
      
      // Notify about individual completions
      groupFlattened.forEach(result => onPageComplete?.(result))
      
      onProgress?.(progress, `Completed ${completedPages}/${totalPages} pages using parallel processing (${batchGroup.length} batches in parallel)`)
      
      console.log(`🏁 Batch group complete: ${completedPages}/${totalPages} total pages processed`)
      
    } catch (error) {
      console.error(`❌ Batch group processing error:`, error)
      throw error
    }
    
    // Small delay between batch groups to avoid overwhelming the API
    if (batchGroupStart + maxParallelBatches < allBatches.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
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

function getMaxParallelBatches(userTier: UserTier): number {
  switch (userTier) {
    case 'free': return 1
    case 'basic': return 2
    case 'pro': return 3
    case 'enterprise': return 4
    default: return 1
  }
} 