// Document chunking utilities for processing large PDFs
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import { TranslationResult } from '../types/translation'

export interface DocumentChunk {
  chunkIndex: number
  startPage: number
  endPage: number
  pageCount: number
  pdfData: Uint8Array
}

export interface ChunkResult {
  chunkIndex: number
  results: TranslationResult[]
  clientImages: Record<number, string>
}

/**
 * Split a large PDF into smaller chunks of up to 20 pages each
 */
export async function splitPDFIntoChunks(
  originalPdfData: Uint8Array, 
  totalPages: number,
  maxPagesPerChunk: number = 20
): Promise<DocumentChunk[]> {
  console.log(`📄 Splitting ${totalPages}-page PDF into chunks of ${maxPagesPerChunk} pages...`)
  
  const chunks: DocumentChunk[] = []
  const originalPdf = await PDFLibDocument.load(originalPdfData)
  
  for (let startPage = 1; startPage <= totalPages; startPage += maxPagesPerChunk) {
    const endPage = Math.min(startPage + maxPagesPerChunk - 1, totalPages)
    const chunkIndex = Math.floor((startPage - 1) / maxPagesPerChunk)
    
    console.log(`📦 Creating chunk ${chunkIndex + 1}: pages ${startPage}-${endPage}`)
    
    // Create new PDF with just this chunk's pages
    const chunkPdf = await PDFLibDocument.create()
    const pageIndices = Array.from(
      { length: endPage - startPage + 1 }, 
      (_, i) => startPage - 1 + i
    )
    
    const copiedPages = await chunkPdf.copyPages(originalPdf, pageIndices)
    copiedPages.forEach(page => chunkPdf.addPage(page))
    
    const chunkPdfData = await chunkPdf.save()
    
    chunks.push({
      chunkIndex,
      startPage,
      endPage,
      pageCount: endPage - startPage + 1,
      pdfData: new Uint8Array(chunkPdfData)
    })
    
    console.log(`✅ Chunk ${chunkIndex + 1} created: ${chunkPdfData.length} bytes`)
  }
  
  console.log(`🎯 Split complete: ${chunks.length} chunks created`)
  return chunks
}

/**
 * Merge chunk results back into a single ordered result set
 */
export function mergeChunkResults(chunkResults: ChunkResult[]): TranslationResult[] {
  console.log(`🔀 Merging results from ${chunkResults.length} chunks...`)
  
  // Sort chunks by index to ensure correct order
  const sortedChunks = chunkResults.sort((a, b) => a.chunkIndex - b.chunkIndex)
  
  const allResults: TranslationResult[] = []
  
  sortedChunks.forEach(chunk => {
    console.log(`📋 Adding ${chunk.results.length} results from chunk ${chunk.chunkIndex + 1}`)
    allResults.push(...chunk.results)
  })
  
  // Sort by page number to ensure correct order (in case chunks finished out of order)
  allResults.sort((a, b) => a.page_number - b.page_number)
  
  console.log(`✅ Merge complete: ${allResults.length} total results`)
  return allResults
}

/**
 * Calculate chunk processing strategy based on document size and user tier
 */
export function getChunkProcessingStrategy(
  totalPages: number,
  userTier: string,
  maxPagesPerChunk: number = 20
) {
  const chunkCount = Math.ceil(totalPages / maxPagesPerChunk)
  
  // Tier-based concurrent chunk limits
  const tierConcurrencyLimits: Record<string, number> = {
    free: 1,      // Process chunks sequentially
    starter: 2,   // Process 2 chunks at once
    pro: 3,       // Process 3 chunks at once
    business: 4   // Process 4 chunks at once
  }
  
  const maxConcurrentChunks = tierConcurrencyLimits[userTier] || 1
  
  return {
    totalPages,
    chunkCount,
    maxPagesPerChunk,
    maxConcurrentChunks,
    estimatedTime: chunkCount * 30, // ~30 seconds per chunk
    strategy: chunkCount <= maxConcurrentChunks ? 'parallel' : 'batched'
  }
}

/**
 * Process chunks in batches to avoid overwhelming the system
 */
export async function processChunksInBatches<T>(
  chunks: DocumentChunk[],
  maxConcurrentChunks: number,
  processor: (chunk: DocumentChunk) => Promise<T>
): Promise<T[]> {
  const results: T[] = []
  
  for (let i = 0; i < chunks.length; i += maxConcurrentChunks) {
    const batch = chunks.slice(i, i + maxConcurrentChunks)
    console.log(`🚀 Processing batch ${Math.floor(i / maxConcurrentChunks) + 1}: chunks ${batch.map(c => c.chunkIndex + 1).join(', ')}`)
    
    const batchPromises = batch.map(chunk => processor(chunk))
    const batchResults = await Promise.all(batchPromises)
    
    results.push(...batchResults)
    
    console.log(`✅ Batch complete: ${batchResults.length} chunks processed`)
    
    // Small delay between batches to be nice to the API
    if (i + maxConcurrentChunks < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  return results
} 