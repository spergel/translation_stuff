// Polyfill for Promise.withResolvers (needed for PDF.js compatibility)
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker - use proper configuration for Next.js
if (typeof window !== 'undefined') {
  // Use the local worker file served from the public directory
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.mjs'
}

export async function extractPageImage(file: File, pageNumber: number): Promise<string> {
  try {
    console.log(`Starting image extraction for page ${pageNumber} of file ${file.name}`)
    
    const arrayBuffer = await file.arrayBuffer()
    console.log(`File loaded, size: ${arrayBuffer.byteLength} bytes`)
    
    // Initialize PDF.js with better error handling
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    })
    
    const pdf = await loadingTask.promise
    console.log(`PDF loaded, total pages: ${pdf.numPages}`)
    
    if (pageNumber > pdf.numPages) {
      console.warn(`Page ${pageNumber} requested but PDF only has ${pdf.numPages} pages`)
      return ''
    }
    
    const page = await pdf.getPage(pageNumber)
    console.log(`Page ${pageNumber} loaded`)
    
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    
    if (!context) {
      console.error('Failed to get canvas 2D context')
      return ''
    }
    
    canvas.height = viewport.height
    canvas.width = viewport.width
    console.log(`Canvas created: ${canvas.width}x${canvas.height}`)
    
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    }
    
    await page.render(renderContext).promise
    console.log(`Page ${pageNumber} rendered successfully`)
    
    // Convert canvas to base64 image
    const dataUrl = canvas.toDataURL('image/png')
    console.log(`Image extracted for page ${pageNumber}, data URL length: ${dataUrl.length}`)
    
    return dataUrl
  } catch (error) {
    console.error(`Error extracting page ${pageNumber} image:`, error)
    return ''
  }
}

export async function getPDFPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    return pdf.numPages
  } catch (error) {
    console.error('Error getting PDF page count:', error)
    return 1
  }
}

interface ExtractedPage {
  pageNumber: number
  imageDataUrl: string
}

export async function extractImagesFromPDF(file: File): Promise<ExtractedPage[]> {
  try {
    console.log('📄 Client-side image extraction starting for:', file.name)
    
    // Read the PDF file
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    // Load PDF document with robust configuration
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    })
    const pdf = await loadingTask.promise
    
    console.log(`📄 PDF loaded: ${pdf.numPages} pages`)
    
    const extractedImages: ExtractedPage[] = []
    
    // Extract each page as image
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`🖼️ Extracting page ${pageNum}/${pdf.numPages}...`)
      
      try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2.0 })
        
        // Create canvas
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.height = viewport.height
        canvas.width = viewport.width
        
        // Render page to canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        }
        
        await page.render(renderContext).promise
        
        // Convert to data URL
        const imageDataUrl = canvas.toDataURL('image/png')
        
        extractedImages.push({
          pageNumber: pageNum,
          imageDataUrl
        })
        
        console.log(`✅ Page ${pageNum} extracted (${imageDataUrl.length} chars)`)
        
      } catch (pageError) {
        console.error(`⚠️ Error extracting page ${pageNum}:`, pageError)
        // Continue with other pages
      }
    }
    
    console.log(`🎉 Client-side extraction complete: ${extractedImages.length} images`)
    return extractedImages
    
  } catch (error) {
    console.error('❌ Client-side extraction failed:', error)
    return []
  }
} 