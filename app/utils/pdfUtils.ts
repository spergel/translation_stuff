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
  // Use CDN worker to avoid ESM syntax issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`
  console.log('📄 PDF.js worker configured:', pdfjsLib.GlobalWorkerOptions.workerSrc)
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
    
    // 🚨 DETAILED LOGGING: What we're processing client-side
    console.log(`\n🖼️ CLIENT-SIDE PDF PROCESSING:`)
    console.log(`📄 File name: ${file.name}`)
    console.log(`📊 File size: ${Math.round(file.size / 1024 / 1024 * 100) / 100} MB`)
    console.log(`🕐 File last modified: ${new Date(file.lastModified).toISOString()}`)
    
    // Read the PDF file
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    console.log(`💾 Array buffer loaded: ${arrayBuffer.byteLength} bytes`)
    console.log(`🔍 PDF header check: ${new TextDecoder().decode(uint8Array.slice(0, 8))}`)
    
    // Quick page count check to avoid processing huge documents client-side
    const quickLoadingTask = pdfjsLib.getDocument({ data: uint8Array })
    const quickPdf = await quickLoadingTask.promise
    const pageCount = quickPdf.numPages
    
    console.log(`📄 PDF has ${pageCount} pages`)
    
    // 🚨 DETAILED LOGGING: Client-side processing decision
    console.log(`\n🤔 CLIENT-SIDE PROCESSING DECISION:`)
    if (pageCount > 50) {
      console.log(`⚠️ PDF has ${pageCount} pages (>50), extracting only first 20 pages client-side`)
      console.log(`🚀 Server-side will handle remaining pages (may be text-only)`)
      console.log(`🎯 Reason: Large documents can cause browser timeouts`)
      return await extractKeyPagesOnly(file, Math.min(20, pageCount))
    }
    
    // Skip client-side extraction for medium-large documents (21-50 pages)
    if (pageCount > 20) {
      console.log(`⚠️ PDF has ${pageCount} pages (>20), skipping client-side extraction to avoid timeouts`)
      console.log(`🚀 Server-side extraction will handle all pages efficiently`)
      console.log(`🎯 Reason: Medium-large docs better handled server-side`)
      return []
    }
    
    if (pageCount > 10) {
      console.log(`📊 PDF has ${pageCount} pages (>10), using reduced quality for client-side extraction`)
    }
    
    // More robust PDF.js configuration to handle problematic PDFs
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true, // Disable font face loading for compatibility
      disableRange: true, // Load entire document for better reliability
      disableStream: true, // Don't use streaming for better compatibility
      disableAutoFetch: true, // Don't auto-fetch additional resources
      verbosity: 0, // Reduce verbosity to minimize console noise
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'
    })
    
    const pdf = await loadingTask.promise
    console.log(`📄 PDF loaded: ${pdf.numPages} pages`)
    
    const extractedImages: ExtractedPage[] = []
    
    // Adjust quality based on document size
    const scale = pageCount > 10 ? 0.8 : 1.0 // Lower scale for larger docs
    const quality = pageCount > 10 ? 0.6 : 0.7 // Lower quality for larger docs
    const maxSizePerImage = pageCount > 10 ? 300000 : 500000 // Smaller max size for larger docs
    
    console.log(`🎛️ Using scale: ${scale}, quality: ${quality}, max size: ${Math.round(maxSizePerImage/1000)}KB per image`)
    
    // Extract each page as image
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      console.log(`🖼️ Extracting page ${pageNum}/${pdf.numPages}...`)
      
      try {
        const page = await pdf.getPage(pageNum)
        // Use dynamic scale based on document size
        const viewport = page.getViewport({ scale })
        
        // 🚨 DETAILED LOGGING: Page extraction details
        console.log(`\n📄 PAGE ${pageNum} EXTRACTION DETAILS:`)
        console.log(`📐 Viewport: ${Math.round(viewport.width)}x${Math.round(viewport.height)}px`)
        console.log(`🎛️ Scale: ${scale}, Quality: ${quality}`)
        console.log(`📏 Max size limit: ${Math.round(maxSizePerImage/1000)}KB`)
        
        // Create canvas
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        
        if (!context) {
          console.error(`❌ Failed to get 2D context for page ${pageNum}`)
          continue
        }
        
        canvas.height = viewport.height
        canvas.width = viewport.width
        
        // Clear the canvas to ensure clean rendering
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = 'white'
        context.fillRect(0, 0, canvas.width, canvas.height)
        
        console.log(`🎨 Canvas created: ${canvas.width}x${canvas.height}px`)
        
        // Render page to canvas with improved configuration
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        }
        
        const renderTask = page.render(renderContext)
        await renderTask.promise
        
        console.log(`✅ PDF.js render completed for page ${pageNum}`)
        
        // Convert to data URL with dynamic compression
        const imageDataUrl = canvas.toDataURL('image/jpeg', quality)
        
        // 🚨 DETAILED LOGGING: Image extraction results
        console.log(`\n🖼️ PAGE ${pageNum} IMAGE EXTRACTION RESULTS:`)
        console.log(`📊 Image data URL length: ${imageDataUrl.length} chars`)
        console.log(`💾 Estimated size: ${Math.round(imageDataUrl.length * 0.75 / 1024)}KB`)
        console.log(`✅ Size check: ${imageDataUrl.length > 5000 ? 'PASS (>5KB)' : 'FAIL (<5KB)'}`)
        console.log(`🚫 Size limit check: ${imageDataUrl.length < maxSizePerImage ? 'PASS' : 'FAIL (too large)'}`)
        
        // Validate that the image isn't just a white/empty canvas and isn't too large
        if (imageDataUrl.length > 5000 && imageDataUrl.length < maxSizePerImage) {
          extractedImages.push({
            pageNumber: pageNum,
            imageDataUrl
          })
          console.log(`✅ Page ${pageNum} extracted successfully (${Math.round(imageDataUrl.length/1000)}KB)`)
        } else if (imageDataUrl.length >= maxSizePerImage) {
          console.warn(`⚠️ Page ${pageNum} image too large (${Math.round(imageDataUrl.length/1000)}KB), skipping client-side extraction`)
        } else {
          console.warn(`⚠️ Page ${pageNum} appears to be empty or very small (${Math.round(imageDataUrl.length/1000)}KB)`)
        }
        
      } catch (pageError) {
        console.error(`⚠️ Error extracting page ${pageNum}:`, pageError)
        
        // Try alternative extraction method for this page
        try {
          const alternativeImage = await extractPageImageAlternative(file, pageNum)
          if (alternativeImage && alternativeImage.length < maxSizePerImage) {
            extractedImages.push({
              pageNumber: pageNum,
              imageDataUrl: alternativeImage
            })
            console.log(`✅ Page ${pageNum} extracted via alternative method`)
          }
        } catch (altError) {
          console.error(`❌ Alternative extraction also failed for page ${pageNum}:`, altError)
        }
      }
    }
    
    console.log(`🎉 Client-side extraction complete: ${extractedImages.length} images`)
    
    // Check total payload size with stricter limits for larger docs
    const maxTotalSize = pageCount > 10 ? 1500000 : 2000000 // 1.5MB for >10 pages, 2MB for ≤10 pages
    const totalSize = extractedImages.reduce((sum, img) => sum + img.imageDataUrl.length, 0)
    console.log(`📊 Total client images size: ${Math.round(totalSize / 1024)}KB (limit: ${Math.round(maxTotalSize / 1024)}KB)`)
    
    if (totalSize > maxTotalSize) {
      console.warn(`⚠️ Total image payload too large (${Math.round(totalSize / 1024)}KB), letting server handle extraction`)
      return [] // Let server handle it
    }
    
    return extractedImages
    
  } catch (error) {
    console.error('❌ Client-side extraction failed:', error)
    
    // Try a completely different approach with simpler configuration
    try {
      console.log('🔄 Attempting fallback extraction method...')
      return await extractImagesSimpleFallback(file)
    } catch (fallbackError) {
      console.error('❌ Fallback extraction also failed:', fallbackError)
      return []
    }
  }
}

// Extract only key pages for very large documents
async function extractKeyPagesOnly(file: File, maxPages: number): Promise<ExtractedPage[]> {
  console.log(`🎯 Extracting key pages (first ${maxPages}) for large document`)
  
  try {
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    const loadingTask = pdfjsLib.getDocument({ 
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0
    })
    
    const pdf = await loadingTask.promise
    const extractedImages: ExtractedPage[] = []
    
    // Use aggressive compression for large docs
    const scale = 0.6  // Very low scale
    const quality = 0.5  // Lower quality
    const maxSizePerImage = 200000  // 200KB max per image
    
    console.log(`🎛️ Key pages extraction: scale=${scale}, quality=${quality}, max=${Math.round(maxSizePerImage/1000)}KB`)
    
    for (let pageNum = 1; pageNum <= Math.min(maxPages, pdf.numPages); pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale })
        
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.height = viewport.height
        canvas.width = viewport.width
        
        context.fillStyle = 'white'
        context.fillRect(0, 0, canvas.width, canvas.height)
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', quality)
        
        if (imageDataUrl.length > 5000 && imageDataUrl.length < maxSizePerImage) {
          extractedImages.push({ pageNumber: pageNum, imageDataUrl })
          console.log(`✅ Key page ${pageNum} extracted (${imageDataUrl.length} chars)`)
        }
        
      } catch (pageError) {
        console.warn(`⚠️ Failed to extract key page ${pageNum}:`, pageError)
      }
    }
    
    const totalSize = extractedImages.reduce((sum, img) => sum + img.imageDataUrl.length, 0)
    console.log(`🎯 Key pages extraction complete: ${extractedImages.length} images, ${Math.round(totalSize / 1024)}KB total`)
    
    return extractedImages
    
  } catch (error) {
    console.error('❌ Key pages extraction failed:', error)
    return []
  }
}

// Alternative extraction method for problematic pages
async function extractPageImageAlternative(file: File, pageNumber: number): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  
  // Simpler PDF.js configuration
  const loadingTask = pdfjsLib.getDocument({ 
    data: arrayBuffer,
    password: '', // Try with empty password
    verbosity: 0
  })
  
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 0.8 }) // Even lower scale for alternative method
  
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  
  canvas.height = viewport.height
  canvas.width = viewport.width
  
  // Simple render without advanced options
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise
  
  return canvas.toDataURL('image/jpeg', 0.6) // Lower quality for alternative method
}

// Simple fallback extraction method
async function extractImagesSimpleFallback(file: File): Promise<ExtractedPage[]> {
  console.log('🔧 Using simple fallback extraction method...')
  
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  const extractedImages: ExtractedPage[] = []
  
  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 10); pageNum++) { // Limit to 10 pages for fallback
    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 0.8 }) // Lower scale for fallback
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.height = viewport.height
      canvas.width = viewport.width
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
      
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.6) // JPEG with lower quality
      if (imageDataUrl.length > 1000 && imageDataUrl.length < 300000) { // Max 300KB for fallback
        extractedImages.push({ pageNumber: pageNum, imageDataUrl })
      }
    } catch (error) {
      console.warn(`Fallback failed for page ${pageNum}:`, error)
    }
  }
  
  return extractedImages
} 