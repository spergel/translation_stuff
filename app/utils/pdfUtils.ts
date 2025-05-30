// Simple client-side PDF image extraction using PDF.js
import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js'
}

export interface ExtractedImage {
  pageNumber: number
  imageDataUrl: string
  width: number
  height: number
  quality: number
}

export interface ExtractedTextData {
  pages: Array<{
    pageNumber: number
    text: string
  }>
  totalPages: number
}

/**
 * Extract text from PDF using client-side PDF.js
 */
export async function extractTextFromPDF(
  file: File,
  options: {
    signal?: AbortSignal
  } = {}
): Promise<ExtractedTextData> {
  const { signal } = options

  console.log(`📝 CLIENT-SIDE text extraction: ${file.name}`)

  try {
    if (signal?.aborted) throw new Error('Cancelled')

    const arrayBuffer = await file.arrayBuffer()
    if (signal?.aborted) throw new Error('Cancelled')
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    const pages: Array<{ pageNumber: number; text: string }> = []

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (signal?.aborted) throw new Error('Cancelled')

      try {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        
        if (signal?.aborted) throw new Error('Cancelled')

        // Extract text from items
        const textItems = textContent.items
          .filter((item: any) => item.str && typeof item.str === 'string')
          .map((item: any) => item.str.trim())
          .filter(str => str.length > 0)

        const pageText = textItems.join(' ')

        pages.push({
          pageNumber: pageNum,
          text: pageText
        })

        console.log(`📄 Extracted text from page ${pageNum}: ${pageText.length} characters`)
        
      } catch (pageError) {
        if (pageError instanceof Error && pageError.message.includes('Cancelled')) {
          throw pageError
        }
        console.warn(`Failed to extract text from page ${pageNum}:`, pageError)
        // Add empty page if extraction fails
        pages.push({
          pageNumber: pageNum,
          text: ''
        })
      }
    }

    console.log(`✅ Text extracted: ${pages.length}/${totalPages} pages`)
    return {
      pages,
      totalPages
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cancelled')) {
      console.log('🛑 Text extraction cancelled')
      throw error
    }
    console.error('❌ Text extraction failed:', error)
    throw error
  }
}

/**
 * Extract images from PDF using client-side PDF.js (SIMPLE VERSION)
 */
export async function extractImagesFromPDF(
  file: File,
  options: {
    scale?: number
    quality?: number
    maxSizeKB?: number
    signal?: AbortSignal
  } = {}
): Promise<ExtractedImage[]> {
  const {
    scale = 0.5,
    quality = 0.4,
    maxSizeKB = 400,
    signal
  } = options

  console.log(`📸 CLIENT-SIDE image extraction: ${file.name}`)

  try {
    if (signal?.aborted) throw new Error('Cancelled')

    const arrayBuffer = await file.arrayBuffer()
    if (signal?.aborted) throw new Error('Cancelled')
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const totalPages = pdf.numPages
    const extractedImages: ExtractedImage[] = []

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (signal?.aborted) throw new Error('Cancelled')

      try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.height = viewport.height
        canvas.width = viewport.width
        
        await page.render({ canvasContext: context, viewport }).promise
        
        if (signal?.aborted) {
          canvas.remove()
          throw new Error('Cancelled')
        }

        let imageDataUrl = canvas.toDataURL('image/jpeg', quality)
        
        // Reduce quality if too large
        let currentQuality = quality
        while (imageDataUrl.length * 0.75 / 1024 > maxSizeKB && currentQuality > 0.1) {
          currentQuality -= 0.1
          imageDataUrl = canvas.toDataURL('image/jpeg', currentQuality)
        }

        extractedImages.push({
          pageNumber: pageNum,
          imageDataUrl,
          width: canvas.width,
          height: canvas.height,
          quality: currentQuality
        })

        canvas.remove()
        
      } catch (pageError) {
        if (pageError instanceof Error && pageError.message.includes('Cancelled')) {
          throw pageError
        }
        console.warn(`Failed to extract page ${pageNum}:`, pageError)
      }
    }

    console.log(`✅ Images extracted: ${extractedImages.length}/${totalPages}`)
    return extractedImages
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cancelled')) {
      console.log('🛑 Image extraction cancelled')
      throw error
    }
    console.error('❌ Image extraction failed:', error)
    throw error
  }
} 