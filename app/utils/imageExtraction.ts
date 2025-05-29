// Image extraction utilities for serverless environment
import { getDocument } from 'pdfjs-serverless'
import { createCanvas } from 'canvas'

// SERVERLESS-COMPATIBLE: Use pdfjs-serverless and canvas for image extraction
export async function extractPageImageFromPDF(fileData: Uint8Array, pageNumber: number, clientImages?: Record<number, string>): Promise<string> {
  // First, check if we have a pre-extracted image from the client
  if (clientImages && clientImages[pageNumber]) {
    const clientImageSize = Math.round(clientImages[pageNumber].length * 0.75 / 1024)
    console.log(`📸 Using pre-extracted client image for page ${pageNumber} (${clientImageSize}KB, ${clientImages[pageNumber].length} chars)`)
    
    // 🚨 DETAILED LOGGING: Client image usage
    console.log(`\n🖼️ CLIENT IMAGE USED FOR PAGE ${pageNumber}:`)
    console.log(`📊 Size: ${clientImageSize}KB (${clientImages[pageNumber].length} chars)`)
    console.log(`🎯 Source: Pre-extracted by client-side PDF.js`)
    console.log(`⚡ Benefit: Faster processing, no server-side extraction needed`)
    
    return clientImages[pageNumber]
  }
  
  // 🚨 DETAILED LOGGING: Server-side extraction needed
  console.log(`\n🔧 SERVER-SIDE IMAGE EXTRACTION FOR PAGE ${pageNumber}:`)
  console.log(`📄 No client image available, extracting server-side`)
  console.log(`🛠️ Method: pdfjs-serverless + canvas`)
  
  try {
    console.log(`🖼️ Extracting image for page ${pageNumber} using pdfjs-serverless and canvas...`)

    // Ensure we have a fresh copy of the data for image extraction
    const imageExtractionData = new Uint8Array(fileData.length)
    imageExtractionData.set(fileData)
    console.log(`🔧 Created fresh copy for image extraction: ${imageExtractionData.length} bytes`)

    // More robust configuration for server-side extraction
    const pdfDocument = await getDocument({ 
      data: imageExtractionData, 
      useSystemFonts: true,
      disableFontFace: true, // Disable font face for better serverless compatibility
      isEvalSupported: false, // Disable eval for security
      disableRange: true, // Load entire document for better reliability
      disableStream: true, // Don't use streaming
      disableAutoFetch: true, // Don't auto-fetch additional resources
      verbosity: 0, // Reduce console noise
      // Add font configurations to prevent rendering issues
      standardFontDataUrl: undefined, // Don't try to load external fonts
      cMapUrl: undefined, // Don't try to load character maps
      cMapPacked: false
    }).promise
    
    const page = await pdfDocument.getPage(pageNumber)

    // Use higher scale for better quality but still manageable size
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    console.log(`🎨 Canvas created: ${viewport.width}x${viewport.height}px`)
    
    // Clear canvas and set white background to ensure visibility
    context.fillStyle = 'white'
    context.fillRect(0, 0, viewport.width, viewport.height)

    const renderContext = {
      canvasContext: context as any, // Type assertion to handle compatibility
      viewport: viewport
    }
    
    console.log(`🎨 Starting PDF page render for page ${pageNumber}...`)
    await page.render(renderContext).promise
    console.log(`✅ PDF page render completed for page ${pageNumber}`)

    // Convert to data URL with quality control
    const dataUrl = canvas.toDataURL('image/png')
    
    // Validate that we didn't just create an empty/white canvas
    if (dataUrl.length < 5000) {
      console.warn(`⚠️ Generated image for page ${pageNumber} is very small (${dataUrl.length} chars), might be empty`)
      
      // Try alternative rendering approach
      console.log(`🔄 Attempting alternative rendering for page ${pageNumber}...`)
      return await renderPageAlternativeMethod(pdfDocument, pageNumber)
    }
    
    console.log(`✅ Successfully extracted image for page ${pageNumber} using pdfjs-serverless/canvas (${dataUrl.length} chars)`)
    return dataUrl

  } catch (error) {
    console.warn(`⚠️ Image extraction failed for page ${pageNumber} with pdfjs-serverless/canvas:`, error instanceof Error ? error.message : String(error))
    
    // Skip Puppeteer in development environment to avoid local setup issues
    if (process.env.NODE_ENV === 'development') {
      console.log(`🚫 Skipping Puppeteer fallback in development environment`)
      return ''
    }
    
    // Try Puppeteer-based extraction as fallback only in production
    console.log(`🔄 Attempting Puppeteer-based image extraction for page ${pageNumber}...`)
    return await extractImageWithPuppeteer(fileData, pageNumber)
  }
}

// Alternative rendering method for problematic pages
async function renderPageAlternativeMethod(pdfDocument: any, pageNumber: number): Promise<string> {
  try {
    console.log(`🔧 Alternative rendering method for page ${pageNumber}`)
    
    const page = await pdfDocument.getPage(pageNumber)
    
    // Try lower scale first
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')
    
    // Set a light gray background to ensure we can see if content is there
    context.fillStyle = '#f5f5f5'
    context.fillRect(0, 0, viewport.width, viewport.height)
    
    // Simple render context without advanced features
    const renderContext = {
      canvasContext: context as any,
      viewport: viewport
    }
    
    await page.render(renderContext).promise
    
    const dataUrl = canvas.toDataURL('image/png')
    console.log(`🔧 Alternative method result for page ${pageNumber}: ${dataUrl.length} chars`)
    
    return dataUrl
    
  } catch (altError) {
    console.warn(`❌ Alternative rendering also failed for page ${pageNumber}:`, altError)
    return ''
  }
}

// Puppeteer-based image extraction fallback
async function extractImageWithPuppeteer(fileData: Uint8Array, pageNumber: number): Promise<string> {
  try {
    console.log(`🤖 Using Puppeteer for page ${pageNumber} image extraction...`)
    
    // Create a temporary PDF file
    const fs = require('fs')
    const path = require('path')
    const tempPdfPath = path.join('/tmp', `temp_${Date.now()}_${pageNumber}.pdf`)
    
    fs.writeFileSync(tempPdfPath, Buffer.from(fileData))
    
    // Use Puppeteer to render PDF page as image
    const puppeteer = require('puppeteer')
    
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    })
    
    const page = await browser.newPage()
    
    // Create a simple HTML page that displays the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { margin: 0; padding: 0; }
          embed { width: 100vw; height: 100vh; }
        </style>
      </head>
      <body>
        <embed src="data:application/pdf;base64,${Buffer.from(fileData).toString('base64')}" type="application/pdf" />
      </body>
      </html>
    `
    
    await page.setContent(htmlContent)
    await page.setViewport({ width: 1200, height: 1600 })
    
    // Wait for PDF to load
    await page.waitForTimeout(2000)
    
    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1200, height: 1600 }
    })
    
    await browser.close()
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempPdfPath)
    } catch (cleanupError) {
      console.warn('Could not clean up temp PDF file:', cleanupError)
    }
    
    // Convert to data URL
    const base64 = screenshot.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`
    
    console.log(`✅ Puppeteer extraction successful for page ${pageNumber} (${dataUrl.length} chars)`)
    return dataUrl
    
  } catch (puppeteerError) {
    console.warn(`❌ Puppeteer extraction failed for page ${pageNumber}:`, puppeteerError)
    return ''
  }
}

// Simplified fallback
export async function extractImageDirectBuffer(fileData: Uint8Array, pageNumber: number): Promise<string> {
  console.log(`🚫 Direct buffer extraction not available, skipping for page ${pageNumber}`)
  return ''
} 