import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { PDFDocument as PDFLibDocument } from 'pdf-lib' // Renamed to avoid conflict
import { put, del } from '@vercel/blob'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, unlinkSync } from 'fs'
// Import serverless-compatible PDF.js specifically built for edge environments
import { getDocument } from 'pdfjs-serverless'
// Import canvas for image generation in serverless environment
import { createCanvas } from 'canvas'

const execAsync = promisify(exec)

// Polyfill for Promise.withResolvers (needed for PDF.js compatibility in server environment)
if (typeof Promise.withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

// Polyfill for Path2D (needed for pdfjs-serverless in serverless environment)
if (typeof global !== 'undefined' && typeof (global as any).Path2D === 'undefined') {
  console.log('🔧 Adding Path2D polyfill for serverless environment...')
  
  // Simple Path2D polyfill for basic operations
  class Path2DPolyfill {
    private commands: any[] = []
    
    constructor(path?: string | Path2DPolyfill) {
      if (typeof path === 'string') {
        // Parse SVG path string if needed
        this.commands = []
      } else if (path instanceof Path2DPolyfill) {
        this.commands = [...path.commands]
      }
    }
    
    moveTo(x: number, y: number) {
      this.commands.push(['moveTo', x, y])
    }
    
    lineTo(x: number, y: number) {
      this.commands.push(['lineTo', x, y])
    }
    
    closePath() {
      this.commands.push(['closePath'])
    }
    
    rect(x: number, y: number, w: number, h: number) {
      this.commands.push(['rect', x, y, w, h])
    }
    
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean) {
      this.commands.push(['arc', x, y, radius, startAngle, endAngle, anticlockwise])
    }
    
    // Add other methods as needed by pdfjs-serverless
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      this.commands.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y])
    }
    
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      this.commands.push(['quadraticCurveTo', cpx, cpy, x, y])
    }
  }
  
  (global as any).Path2D = Path2DPolyfill
  console.log('✅ Path2D polyfill added successfully')
}

// No worker configuration needed - pdfjs-serverless handles this automatically
console.log(`🔧 Using pdfjs-serverless - no worker configuration needed`)

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

// SERVERLESS-COMPATIBLE: Use pdfjs-serverless and canvas for image extraction
async function extractPageImageFromPDF(fileData: Uint8Array, pageNumber: number, clientImages?: Record<number, string>): Promise<string> {
  // First, check if we have a pre-extracted image from the client
  if (clientImages && clientImages[pageNumber]) {
    console.log(`📸 Using pre-extracted client image for page ${pageNumber} (${clientImages[pageNumber].length} chars)`)
    return clientImages[pageNumber]
  }
  
  try {
    console.log(`🖼️ Extracting image for page ${pageNumber} using pdfjs-serverless and canvas...`)

    // Ensure we have a fresh copy of the data for image extraction
    const imageExtractionData = new Uint8Array(fileData.length)
    imageExtractionData.set(fileData)
    console.log(`🔧 Created fresh copy for image extraction: ${imageExtractionData.length} bytes`)

    const pdfDocument = await getDocument({ 
      data: imageExtractionData, 
      useSystemFonts: true,
      disableFontFace: true, // Disable font face for better serverless compatibility
      isEvalSupported: false, // Disable eval for security
      disableRange: true, // Load entire document for better reliability
      disableStream: true, // Don't use streaming
      disableAutoFetch: true // Don't auto-fetch additional resources
    }).promise
    
    const page = await pdfDocument.getPage(pageNumber)

    const viewport = page.getViewport({ scale: 2.0 }) // Scale can be adjusted
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    console.log(`🎨 Canvas created: ${viewport.width}x${viewport.height}px`)

    const renderContext = {
      canvasContext: context as any, // Type assertion to handle compatibility
      viewport: viewport,
      renderInteractiveForms: false // Disable interactive forms for better compatibility
    }
    
    console.log(`🎨 Starting PDF page render for page ${pageNumber}...`)
    await page.render(renderContext).promise
    console.log(`✅ PDF page render completed for page ${pageNumber}`)

    const dataUrl = canvas.toDataURL('image/png') // PNG format without quality parameter
    console.log(`✅ Successfully extracted image for page ${pageNumber} using pdfjs-serverless/canvas (${dataUrl.length} chars)`)
    return dataUrl

  } catch (error) {
    console.warn(`⚠️ Image extraction failed for page ${pageNumber} with pdfjs-serverless/canvas:`, error instanceof Error ? error.message : String(error))
    
    // Try a different approach if the first one fails
    if (error instanceof Error && (error.message.includes('Path2D') || error.message.includes('canvas'))) {
      console.log(`🔄 Attempting alternative image extraction for page ${pageNumber}...`)
      return await extractImageDirectBuffer(fileData, pageNumber) // Use existing fallback function
    }
    
    // If it's a worker-related error, disable image extraction for subsequent attempts
    if (error instanceof Error && error.message.includes('worker')) {
      console.log(`🚫 Worker error detected, image extraction will be disabled for performance`)
    }
    
    return '' // Gracefully fallback to text-only
  }
}

// Helper function for direct buffer processing (fallback method)
async function extractImageDirectBuffer(fileData: Uint8Array, pageNumber: number): Promise<string> {
  try {
    console.log(`🔧 Direct pdftoppm extraction for page ${pageNumber} (${fileData.length} bytes)`)
    
    // Create a temporary file path
    const tempPdfPath = `/tmp/temp_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`
    const tempPngPath = `/tmp/temp_${Date.now()}_${Math.random().toString(36).substring(7)}.png`
    
    try {
      // Write PDF data to temporary file
      console.log(`📝 Writing PDF to temporary file: ${tempPdfPath}`)
      writeFileSync(tempPdfPath, Buffer.from(fileData))
      
      // Convert using pdftoppm with temporary files
      const convertCommand = `pdftoppm -png -f ${pageNumber} -l ${pageNumber} "${tempPdfPath}" "${tempPngPath.replace('.png', '')}"`
      
      console.log(`🔧 Converting PDF to PNG using pdftoppm with temp files...`)
      await execAsync(convertCommand)
      
      // pdftoppm creates files with format: basename-pagenumber.png
      const actualPngPath = `${tempPngPath.replace('.png', '')}-${pageNumber.toString().padStart(2, '0')}.png`
      
      // Read the PNG file
      console.log(`📖 Reading PNG file: ${actualPngPath}`)
      const { stdout: pngData } = await execAsync(`cat "${actualPngPath}"`, {
        encoding: 'buffer'
      })
      
      if (pngData && pngData.length > 1000) {
        const base64 = pngData.toString('base64')
        const dataUrl = `data:image/png;base64,${base64}`
        
        console.log(`✅ Direct pdftoppm successful for page ${pageNumber} (${dataUrl.length} chars)`)
        return dataUrl
      } else {
        console.warn(`⚠️ Direct pdftoppm returned insufficient data for page ${pageNumber}: ${pngData ? pngData.length : 0} bytes`)
        return ''
      }
      
    } finally {
      // Clean up temporary files
      try {
        unlinkSync(tempPdfPath)
        // Clean up the actual PNG file created by pdftoppm
        const actualPngPath = `${tempPngPath.replace('.png', '')}-${pageNumber.toString().padStart(2, '0')}.png`
        unlinkSync(actualPngPath)
        console.log(`🗑️ Cleaned up temporary files`)
      } catch (cleanupError) {
        console.warn('Could not clean up temporary files:', cleanupError)
      }
    }
    
  } catch (directError) {
    console.warn(`⚠️ Direct pdftoppm failed for page ${pageNumber}:`, directError instanceof Error ? directError.message : String(directError))
    return ''
  }
}

// SaaS Tier Configuration
interface TierConfig {
  name: string
  maxPages: number
  batchSize: number
  concurrentFiles: number
  requestsPerMinute: number
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    maxPages: 20,
    batchSize: 1, // Sequential processing
    concurrentFiles: 1,
    requestsPerMinute: 10
  },
  basic: {
    name: 'Basic',
    maxPages: 100,
    batchSize: 20, // Process 20 pages at once
    concurrentFiles: 2,
    requestsPerMinute: 30
  },
  pro: {
    name: 'Pro',
    maxPages: 500,
    batchSize: 40, // Process 40 pages at once
    concurrentFiles: 5,
    requestsPerMinute: 100
  },
  enterprise: {
    name: 'Enterprise',
    maxPages: -1, // Unlimited
    batchSize: 100, // Process 100 pages at once
    concurrentFiles: 10,
    requestsPerMinute: 500
  }
}

interface TranslationResult {
  page_number: number
  original_text: string
  translated_text: string
  notes?: string
  page_image?: string // Base64 encoded PNG
  layout_structure: {
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

interface TranslationResponse {
  document_title: string
  total_pages: number
  target_language: string
  translations: TranslationResult[]
}

// Helper function to extract page count from PDF
async function getPDFPageCount(fileData: Uint8Array): Promise<number> {
  try {
    // Using PDF.js to get page count as it's already a dependency
    const pdfDocument = await getDocument({ data: fileData, useSystemFonts: true }).promise
    return pdfDocument.numPages
  } catch (error) {
    console.error('Error getting PDF page count with pdfjs-serverless:', error)
    // Fallback to pdf-lib if PDF.js fails for some reason
    try {
        const pdfDoc = await PDFLibDocument.load(fileData)
        return pdfDoc.getPageCount()
    } catch (pdflibError) {
        console.error('Error getting PDF page count with pdf-lib fallback:', pdflibError)
        return 1 // Default to 1 if both fail
    }
  }
}

// Helper function to process a single page
async function processSinglePage(
  originalPdfBytes: Uint8Array, // Changed to pass original bytes for image extraction
  pageNum: number,
  targetLanguage: string,
  totalPages: number,
  clientImages?: Record<number, string>, // Add client images parameter
  progressCallback?: (progress: number, message: string) => void
): Promise<TranslationResult> {
  console.log(`📄 Creating single-page PDF for page ${pageNum} (for text extraction)... `)

  // DEBUG: Validate originalPdfBytes at the start of this function
  console.log(`🔍 DEBUGGING originalPdfBytes at start of processSinglePage for page ${pageNum}:`)
  console.log(`   - originalPdfBytes type: ${typeof originalPdfBytes}`)
  console.log(`   - originalPdfBytes instanceof Uint8Array: ${originalPdfBytes instanceof Uint8Array}`)
  console.log(`   - originalPdfBytes.length: ${originalPdfBytes ? originalPdfBytes.length : 'undefined'}`)
  console.log(`   - originalPdfBytes.constructor.name: ${originalPdfBytes ? originalPdfBytes.constructor.name : 'undefined'}`)
  
  if (!originalPdfBytes || originalPdfBytes.length === 0) {
    throw new Error(`PDF data is empty or corrupted at processSinglePage entry for page ${pageNum}. Length: ${originalPdfBytes ? originalPdfBytes.length : 'undefined'}`)
  }
  
  // DEBUG: Verify PDF header one more time before pdf-lib processing
  const pdfHeader = new TextDecoder().decode(originalPdfBytes.slice(0, 8))
  console.log(`🔍 PDF header verification at processSinglePage page ${pageNum}: "${pdfHeader}"`)
  
  if (!pdfHeader.startsWith('%PDF')) {
    throw new Error(`Invalid PDF header at processSinglePage for page ${pageNum}: ${pdfHeader}`)
  }

  if (progressCallback) {
    progressCallback(0, `Starting page ${pageNum}...`)
  }

  try {
    // Create a new PDF with just this page using pdf-lib for text extraction
    console.log(`🔧 Loading original PDF with pdf-lib for page ${pageNum}...`)
    const originalPdfDoc = await PDFLibDocument.load(originalPdfBytes)
    console.log(`✅ Successfully loaded original PDF with pdf-lib for page ${pageNum}`)
    
    const singlePagePdf = await PDFLibDocument.create()
    const [copiedPage] = await singlePagePdf.copyPages(originalPdfDoc, [pageNum - 1])
    singlePagePdf.addPage(copiedPage)

    // Convert to bytes for Gemini API
    const singlePageBytesForGemini = await singlePagePdf.save()
    const singlePageBase64 = Buffer.from(singlePageBytesForGemini).toString('base64')
    const singlePageSizeMB = Math.round(singlePageBytesForGemini.length / (1024 * 1024) * 100) / 100

    console.log(`📤 Sending page ${pageNum} as ${singlePageSizeMB} MB PDF to Gemini for text`)

    // Use the single page PDF for translation
    var pdfDataForGemini = singlePageBase64
    var pdfDescription = `single page ${pageNum}`
    
  } catch (pdfLibError) {
    console.warn(`⚠️ pdf-lib failed for page ${pageNum}, falling back to full PDF: ${pdfLibError instanceof Error ? pdfLibError.message : 'Unknown error'}`)
    
    // FALLBACK: Use the original full PDF when pdf-lib fails
    const fullPdfBase64 = Buffer.from(originalPdfBytes).toString('base64')
    const fullPdfSizeMB = Math.round(originalPdfBytes.length / (1024 * 1024) * 100) / 100
    
    console.log(`📤 FALLBACK: Sending full PDF (${fullPdfSizeMB} MB) to Gemini for page ${pageNum} extraction`)
    
    var pdfDataForGemini = fullPdfBase64
    var pdfDescription = `full PDF (extracting page ${pageNum})`
  }

  // STRUCTURED OUTPUT PROMPT - using Gemini's built-in JSON schema
  const pagePrompt = `You are processing PAGE ${pageNum} of a ${totalPages}-page document.

Extract and translate this page to ${targetLanguage}. 

IMPORTANT: This is page number ${pageNum}. Please return this exact page number in your response.

Extract the original text from this page and provide a clear translation. Use newlines (\\n) to separate paragraphs and maintain the document structure.

${pdfDescription.includes('full PDF') ? `IMPORTANT: This PDF contains multiple pages, but you should ONLY process and extract text from PAGE ${pageNum}. Ignore all other pages.` : ''}`

  if (progressCallback) {
    progressCallback(20, `Translating page ${pageNum}...`)
  }

  const requestStartTime = Date.now()

  // Send the PDF data (either single page or full PDF) with structured output schema
  const requestBody = {
    contents: [
      {
        parts: [
          { text: pagePrompt },
          { 
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfDataForGemini
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          page_number: {
            type: "INTEGER",
            description: "The page number being processed"
          },
          original_text: {
            type: "STRING", 
            description: "The original text extracted from this page"
          },
          translated_text: {
            type: "STRING",
            description: "The translation of the text in the target language"
          }
        },
        required: ["page_number", "original_text", "translated_text"]
      }
    }
  }

  const translationPromise = (async () => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000) // 60 second timeout to prevent hanging
    })
    
    if (progressCallback) {
      progressCallback(60, `Translation completed for page ${pageNum}`)
    }
    
    return response
  })()

  // Wait for translation to complete
  console.log(`⏳ Waiting for translation for page ${pageNum}...`)
  const response = await translationPromise

  const requestEndTime = Date.now()
  const requestTime = requestEndTime - requestStartTime
  console.log(`📥 Response for page ${pageNum}: ${response.status} (took ${requestTime}ms)`)

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`API error for page ${pageNum}:`, response.status, errorText)
    throw new Error(`API request failed for page ${pageNum}: ${response.status}`)
  }

  const result = await response.json()
  const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  
  console.log(`📋 Structured JSON response for page ${pageNum}: ${responseText?.substring(0, 200)}`)
  
  if (!responseText) {
    throw new Error(`No response text for page ${pageNum}`)
  }

  // With structured output, we should get clean JSON directly
  let pageData: any
  try {
    pageData = JSON.parse(responseText)
    console.log(`✅ Page ${pageNum} parsed successfully - Original: ${pageData.original_text?.length || 0} chars, Translation: ${pageData.translated_text?.length || 0} chars`)
  } catch (parseError) {
    console.warn(`⚠️ JSON parse error for page ${pageNum}, attempting backup fix...`)
    
    // Try backup JSON fixer
    pageData = await fixBrokenJSON(responseText, pageNum)
    console.log(`🔧 Page ${pageNum} recovered via backup - Original: ${pageData.original_text?.length || 0} chars, Translation: ${pageData.translated_text?.length || 0} chars`)
  }
  
  if (progressCallback) {
    progressCallback(90, `Page ${pageNum} translation complete`)
  }

  // Extract image from the original full PDF's page data
  const pageImage = await extractPageImageFromPDF(originalPdfBytes, pageNum, clientImages)

  if (progressCallback) {
    progressCallback(100, `Page ${pageNum} complete with text and image`)
  }

  return {
    page_number: pageNum, // Force use our loop page number instead of AI's response
    original_text: pageData.original_text || 'Could not extract text from this page',
    translated_text: pageData.translated_text || 'Translation unavailable',
    layout_structure: {
      page_type: 'content_page',
      sections: [{
        type: 'paragraph',
        content: pageData.translated_text || 'Translation unavailable',
        formatting: 'normal',
        position: 'left'
      }],
      columns: 1,
      has_images: !!pageImage && pageImage.length > 50, // Check if image is substantial
      special_elements: []
    },
    notes: undefined,
    page_image: pageImage
  }
}

// BATCH PROCESSING: Process multiple pages concurrently
async function processBatchOfPages(
  originalPdfBytes: Uint8Array, // Pass original bytes
  pageNumbers: number[],
  targetLanguage: string,
  totalPages: number,
  clientImages: Record<number, string>, // Add client images parameter
  progressCallback: (progress: number, message: string) => void,
  completedPagesCount: number, // Add parameter to track total completed pages
  resultCallback?: (result: TranslationResult) => void // Add callback for individual results
): Promise<TranslationResult[]> {
  console.log(`🚀 BATCH: Processing ${pageNumbers.length} pages concurrently: [${pageNumbers.join(', ')}]`)
  
  const batchStartTime = Date.now()
  let completedInBatch = 0
  
  try {
    // Process all pages in this batch concurrently
    const batchPromises = pageNumbers.map(pageNum => 
      processSinglePage(originalPdfBytes, pageNum, targetLanguage, totalPages, clientImages, (pageProgress, pageMessage) => {
        // When a page completes, update the main progress
        if (pageProgress === 100) {
          completedInBatch++
          const totalCompleted = completedPagesCount + completedInBatch
          const overallProgress = Math.round((totalCompleted / totalPages) * 90) + 5
          
          console.log(`✅ Page ${pageNum} completed: ${pageMessage}`)
          progressCallback(overallProgress, `Completed ${totalCompleted}/${totalPages} pages`)
        }
      }).then(result => {
        // Send individual result to frontend when page completes
        if (resultCallback) {
          resultCallback(result)
        }
        return result
      })
    )
    
    // Wait for all pages in the batch to complete
    const batchResults = await Promise.all(batchPromises)
    
    const batchEndTime = Date.now()
    const batchTime = Math.round((batchEndTime - batchStartTime) / 1000)
    const timePerPage = Math.round(batchTime / pageNumbers.length * 10) / 10
    
    console.log(`✅ BATCH COMPLETE: ${pageNumbers.length} pages in ${batchTime}s (${timePerPage}s per page)`)
    
    // Final batch completion update
    const newCompletedCount = completedPagesCount + pageNumbers.length
    const progress = Math.round((newCompletedCount / totalPages) * 90) + 5
    
    progressCallback(
      progress, 
      `Completed ${newCompletedCount}/${totalPages} pages (batch ${Math.min(...pageNumbers)}-${Math.max(...pageNumbers)} finished)`
    )
    
    return batchResults.sort((a, b) => a.page_number - b.page_number)
    
  } catch (error) {
    console.error(`❌ BATCH ERROR for pages [${pageNumbers.join(', ')}]:`, error)
    
    // Return partial results instead of complete failure
    return pageNumbers.map(pageNum => ({
      page_number: pageNum,
      original_text: 'Page processing encountered an issue',
      translated_text: 'Unable to translate this page in current batch',
      layout_structure: {
        page_type: 'error_page',
        sections: [{
          type: 'paragraph',
          content: 'Unable to translate this page in current batch',
          formatting: 'normal',
          position: 'left'
        }],
        columns: 1,
        has_images: false,
        special_elements: []
      },
      notes: `Page ${pageNum} - batch processing issue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      page_image: ''
    }))
  }
}

// MAIN PROCESSING FUNCTION: Handles both sequential and batch processing
async function processIndividualPagesSplit(
  fileData: Uint8Array,
  targetLanguage: string,
  totalPages: number,
  userTier: string = 'free',
  clientImages: Record<number, string> = {}, // Add client images parameter
  progressCallback: (progress: number, message: string) => void,
  resultCallback?: (result: TranslationResult) => void // Add callback for individual results
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = []
  const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
  
  // DEBUG: Validate fileData at the start of this function
  console.log(`🔍 DEBUGGING fileData at start of processIndividualPagesSplit:`)
  console.log(`   - fileData type: ${typeof fileData}`)
  console.log(`   - fileData instanceof Uint8Array: ${fileData instanceof Uint8Array}`)
  console.log(`   - fileData.length: ${fileData ? fileData.length : 'undefined'}`)
  console.log(`   - fileData.constructor.name: ${fileData ? fileData.constructor.name : 'undefined'}`)
  
  if (!fileData || fileData.length === 0) {
    throw new Error(`PDF data is empty or corrupted at processIndividualPagesSplit entry. Length: ${fileData ? fileData.length : 'undefined'}`)
  }
  
  // Apply page limit based on tier
  const maxPagesToProcess = tierConfig.maxPages === -1 ? totalPages : Math.min(totalPages, tierConfig.maxPages)
  
  // Batch processing is automatic based on tier
  const useBatchProcessing = tierConfig.batchSize > 1
  
  const fileSizeMB = Math.round(fileData.length / (1024 * 1024) * 100) / 100
  console.log(`📄 PROCESSING APPROACH: ${useBatchProcessing ? 'BATCH' : 'SEQUENTIAL'}`)
  console.log(`   - User Tier: ${tierConfig.name}`)
  console.log(`   - Original file size: ${fileSizeMB} MB`)
  console.log(`   - Total pages in PDF: ${totalPages}`)
  console.log(`   - Pages to process: ${maxPagesToProcess} (limit: ${tierConfig.maxPages === -1 ? 'unlimited' : tierConfig.maxPages})`)
  console.log(`   - Batch size: ${tierConfig.batchSize}`)
  console.log(`   - Extract images: enabled (with fallback to text-only for reliability) using pdfjs-serverless and canvas`)

  try {
    // Additional validation before processing
    console.log(`📄 Original PDF data ready (${fileData.length} bytes)`)
    
    // DEBUG: Verify PDF header one more time before processing
    const pdfHeader = new TextDecoder().decode(fileData.slice(0, 8))
    console.log(`🔍 PDF header verification: "${pdfHeader}"`)
    
    if (!pdfHeader.startsWith('%PDF')) {
      throw new Error(`Invalid PDF header at processing stage: ${pdfHeader}`)
    }

    if (useBatchProcessing && tierConfig.batchSize > 1) {
      // BATCH PROCESSING for paid users
      console.log(`🚀 Using BATCH processing with batch size: ${tierConfig.batchSize}`)
      
      const pageNumbers = Array.from({length: maxPagesToProcess}, (_, i) => i + 1)
      const batches: number[][] = []
      
      // Split pages into batches
      for (let i = 0; i < pageNumbers.length; i += tierConfig.batchSize) {
        batches.push(pageNumbers.slice(i, i + tierConfig.batchSize))
      }
      
      console.log(`📊 Created ${batches.length} batches:`, batches.map(batch => `[${batch[0]}-${batch[batch.length-1]}]`).join(', '))
      
      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        
        console.log(`📦 Starting batch ${batchIndex + 1}/${batches.length}: pages [${batch.join(', ')}]`)
        
        // DEBUG: Validate fileData before passing to batch processing
        console.log(`🔍 Validating fileData before batch ${batchIndex + 1}: ${fileData.length} bytes`)
        
        // CRITICAL FIX: Create a fresh copy for each batch to prevent pdf-lib from corrupting the original
        console.log(`🔧 Creating fresh copy of fileData for batch ${batchIndex + 1} processing...`)
        const fileDataCopyForBatch = new Uint8Array(fileData.length)
        fileDataCopyForBatch.set(fileData)
        console.log(`✅ Fresh copy created for batch ${batchIndex + 1}: ${fileDataCopyForBatch.length} bytes`)
        
        const batchResults = await processBatchOfPages(
          fileDataCopyForBatch, // Pass fresh copy instead of original
          batch,
          targetLanguage,
          totalPages,
          clientImages, // Pass client images for batch processing
          progressCallback,
          results.length, // Pass current completed count
          result => {
            results.push(result)
            // Send individual result to frontend if callback provided
            if (resultCallback) {
              resultCallback(result)
            }
          }
        )
        
        // batchResults should already be in results from the callback
        console.log(`📊 Progress: ${results.length}/${maxPagesToProcess} pages completed`)
        
        // Small delay between batches to avoid overwhelming the API
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
    } else {
      // SEQUENTIAL PROCESSING for free users
      console.log(`⏭️ Using SEQUENTIAL processing`)
      
      for (let pageNum = 1; pageNum <= maxPagesToProcess; pageNum++) {
        try {
          console.log(`📄 Processing page ${pageNum}/${maxPagesToProcess} (sequential)... `)

          // DEBUG: Validate fileData before each page processing
          console.log(`🔍 Validating fileData before page ${pageNum}: ${fileData.length} bytes`)

          // CRITICAL FIX: Create a fresh copy for each page to prevent pdf-lib from corrupting the original
          console.log(`🔧 Creating fresh copy of fileData for page ${pageNum} processing...`)
          const fileDataCopyForPage = new Uint8Array(fileData.length)
          fileDataCopyForPage.set(fileData)
          console.log(`✅ Fresh copy created for page ${pageNum}: ${fileDataCopyForPage.length} bytes`)

          const pageResult = await processSinglePage(fileDataCopyForPage, pageNum, targetLanguage, totalPages, clientImages, (pageProgress, pageMessage) => {
            // Don't spam with individual page progress in sequential mode
            if (pageProgress === 100) {
              console.log(`✅ Page ${pageNum} completed: ${pageMessage}`)
            }
          })
          results.push(pageResult)

          // Send individual result to frontend if callback provided
          if (resultCallback) {
            resultCallback(pageResult)
          }

          // Update cumulative progress
          const progress = Math.round((results.length / maxPagesToProcess) * 90) + 5
          progressCallback(
            progress,
            `Completed ${results.length}/${maxPagesToProcess} pages`
          )

          // Small delay between requests for sequential processing
          await new Promise(resolve => setTimeout(resolve, 100))

        } catch (error) {
          console.error(`⚠️ Issue processing page ${pageNum}:`, error)
          results.push({
            page_number: pageNum,
            original_text: 'Page processing encountered an issue',
            translated_text: 'Unable to translate this page',
            layout_structure: {
              page_type: 'error_page',
              sections: [{
                type: 'paragraph',
                content: 'Unable to translate this page',
                formatting: 'normal',
                position: 'left'
              }],
              columns: 1,
              has_images: false,
              special_elements: []
            },
            notes: `Page ${pageNum} - processing issue: ${error instanceof Error ? error.message : 'Unknown error'}`,
            page_image: ''
          })
          
          // Still update progress even for problematic pages
          const progress = Math.round((results.length / maxPagesToProcess) * 90) + 5
          progressCallback(progress, `Completed ${results.length}/${maxPagesToProcess} pages (page ${pageNum} had issues)`)
        }
      }
    }

    const totalDataSent = results.length * (fileSizeMB / totalPages) // This calculation might need adjustment
    console.log(`🏁 Processing complete. Total data sent (text extraction): ~ ${Math.round(totalDataSent * 100) / 100} MB`)
    
    // Validate page numbers are correct and sequential
    console.log(`🔍 Validating page numbers...`)
    const pageNumbers = results.map(r => r.page_number).sort((a, b) => a - b)
    const expectedPages = Array.from({length: maxPagesToProcess}, (_, i) => i + 1)
    const missingPages = expectedPages.filter(p => !pageNumbers.includes(p))
    const duplicatePages = pageNumbers.filter((p, i) => pageNumbers.indexOf(p) !== i)
    
    console.log(`📊 Page validation:`, {
      expected: expectedPages.slice(0, 10), // Show first 10 for brevity
      actual: pageNumbers.slice(0, 10),
      missing: missingPages.slice(0, 10),
      duplicates: duplicatePages,
      total_results: results.length,
      total_expected: maxPagesToProcess
    })
    
    if (missingPages.length > 0 || duplicatePages.length > 0) {
      console.warn(`⚠️ Page numbering issues detected!`)
    }
    
    return results

  } catch (error) {
    console.error('Error in processing:', error)
    throw error
  }
}

// Backup function to fix broken JSON responses
async function fixBrokenJSON(brokenText: string, pageNumber: number): Promise<any> {
  console.log(`🔧 Attempting to fix broken JSON for page ${pageNumber}...`)
  
  try {
    const fixPrompt = `The following text appears to be broken JSON from a PDF translation task. Please fix it and return ONLY valid JSON with these exact keys: "page_number", "original_text", "translated_text". Do not add explanations or extra text, just the fixed JSON:

${brokenText.substring(0, 8000)}`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: fixPrompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      }),
      signal: AbortSignal.timeout(30000) // 30 second timeout for backup call
    })

    if (!response.ok) {
      throw new Error(`Backup API call failed: ${response.status}`)
    }

    const result = await response.json()
    const fixedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    
    if (!fixedText) {
      throw new Error('No response from backup LLM')
    }

    // Try to parse the fixed JSON
    const fixedData = JSON.parse(fixedText)
    console.log(`✅ Successfully fixed JSON for page ${pageNumber}`)
    return fixedData

  } catch (error) {
    console.error(`❌ Backup JSON fix failed for page ${pageNumber}:`, error)
    // Return a minimal valid response instead of failing
    return {
      page_number: pageNumber,
      original_text: 'Text extraction encountered technical difficulties',
      translated_text: 'Translation process encountered technical difficulties due to response formatting issues'
    }
  }
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()
  let controllerClosed = false
  
  const stream = new ReadableStream({
    start(controller) {
      const sendUpdate = (progress: number, message: string) => {
        if (controllerClosed) {
          console.log('⚠️ Attempted to send update after controller closed:', message)
          return
        }
        try {
          const data = JSON.stringify({ progress, message })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch (error) {
          console.error('Error sending update:', error)
          controllerClosed = true
        }
      }

      ;(async () => {
        try {
          const formData = await request.formData()
          const file = formData.get('file') as File
          const targetLanguage = formData.get('targetLanguage') as string
          const userTier = formData.get('userTier') as string || 'free'
          
          // NEW: Accept pre-extracted images from client
          const preExtractedImages = formData.get('preExtractedImages') as string || '[]'
          let clientImages: Record<number, string> = {}
          
          try {
            const parsedImages = JSON.parse(preExtractedImages)
            if (Array.isArray(parsedImages)) {
              clientImages = parsedImages.reduce((acc: Record<number, string>, img: any) => {
                if (img.pageNumber && img.imageDataUrl) {
                  acc[img.pageNumber] = img.imageDataUrl
                }
                return acc
              }, {})
              console.log(`📸 Received ${Object.keys(clientImages).length} pre-extracted images from client`)
            }
          } catch (error) {
            console.log('⚠️ No pre-extracted images or parsing failed, will use server-side extraction')
          }

          if (!file) {
            throw new Error('No file provided')
          }

          if (!file.size || file.size === 0) {
            throw new Error('File is empty or corrupted')
          }

          console.log(`📄 File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`)

          sendUpdate(1, 'Reading PDF file...')
          
          let fileData: Uint8Array
          try {
            const arrayBuffer = await file.arrayBuffer()
            fileData = new Uint8Array(arrayBuffer)
            
            if (fileData.length === 0) {
              throw new Error('File array buffer is empty')
            }
            
            // Verify it's a PDF by checking header
            const pdfHeader = new TextDecoder().decode(fileData.slice(0, 4))
            if (!pdfHeader.startsWith('%PDF')) {
              throw new Error(`Invalid PDF file. Header: ${pdfHeader}`)
            }
            
            console.log(`✅ PDF file read successfully: ${fileData.length} bytes, header: ${pdfHeader}`)
            
            // VERCEL FIX: Create a new Uint8Array to prevent any potential reference issues in serverless environment
            console.log(`🔧 Creating defensive copy of file data for Vercel serverless environment...`)
            const defensiveCopy = new Uint8Array(fileData.length)
            defensiveCopy.set(fileData)
            fileData = defensiveCopy
            
            // Verify the copy is valid
            const copyHeader = new TextDecoder().decode(fileData.slice(0, 8))
            console.log(`✅ Defensive copy created successfully: ${fileData.length} bytes, header: ${copyHeader}`)
            
          } catch (fileError) {
            console.error('❌ File reading error:', fileError)
            throw new Error(`Failed to read PDF file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`)
          }
          
          sendUpdate(3, 'Analyzing PDF structure...')
          
          // DEBUG: Validate fileData before getPDFPageCount
          console.log(`🔍 DEBUGGING fileData before getPDFPageCount:`)
          console.log(`   - fileData.length: ${fileData ? fileData.length : 'undefined'}`)
          console.log(`   - fileData header: ${fileData ? new TextDecoder().decode(fileData.slice(0, 8)) : 'undefined'}`)
          
          // Create a separate copy for getPDFPageCount to prevent corruption
          const fileDataForPageCount = new Uint8Array(fileData.length)
          fileDataForPageCount.set(fileData)
          console.log(`📄 Created separate copy for page count: ${fileDataForPageCount.length} bytes`)
          
          const totalPages = await getPDFPageCount(fileDataForPageCount)
          
          // DEBUG: Validate fileData after getPDFPageCount
          console.log(`🔍 DEBUGGING fileData after getPDFPageCount:`)
          console.log(`   - fileData.length: ${fileData ? fileData.length : 'undefined'}`)
          console.log(`   - fileData header: ${fileData ? new TextDecoder().decode(fileData.slice(0, 8)) : 'undefined'}`)
          
          const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
          const maxPagesToProcess = tierConfig.maxPages === -1 ? totalPages : Math.min(totalPages, tierConfig.maxPages)
          
          sendUpdate(5, `Found ${totalPages} pages. Processing ${maxPagesToProcess} pages with ${tierConfig.name} tier...`)

          const results = await processIndividualPagesSplit(
            fileData,
            targetLanguage,
            totalPages,
            userTier,
            clientImages,
            sendUpdate,
            result => {
              // Send individual result to frontend when page completes
              if (!controllerClosed) {
                try {
                  console.log(`🎯 SENDING INDIVIDUAL RESULT for page ${result.page_number}`)
                  
                  const resultData = JSON.stringify({
                    type: 'result',
                    result: result
                  })
                  
                  console.log(`📤 Sending individual result (${resultData.length} chars)`)
                  controller.enqueue(encoder.encode(`data: ${resultData}\n\n`))
                } catch (error) {
                  console.error('Error sending individual result:', error)
                  controllerClosed = true
                }
              }
            }
          )

          // Send final progress update to 100%
          sendUpdate(100, `Translation complete! Processed ${results.length} pages.`)

          // Send completion
          if (!controllerClosed) {
            try {
              console.log(`🎯 SENDING COMPLETION MESSAGE for ${results.length} pages`)
              
              // Create a lightweight completion message first (essential data only)
              const lightweightCompletion = JSON.stringify({
                type: 'complete',
                progress: 100,
                message: `Translation complete! Processed ${results.length} pages.`,
                metadata: {
                  total_pages: totalPages,
                  processed_pages: results.length,
                  user_tier: tierConfig.name,
                  batch_processing: tierConfig.batchSize > 1,
                  batch_size: tierConfig.batchSize
                },
                // Only send essential results data, not full content
                resultsCount: results.length,
                hasResults: true
              })
              
              console.log(`📤 Lightweight completion message size: ${lightweightCompletion.length} chars`)
              controller.enqueue(encoder.encode(`data: ${lightweightCompletion}\n\n`))
              
              // Then send the full results in a separate message if needed
              const fullResults = JSON.stringify({
                type: 'results',
                results: results
              })
              
              // Only send full results if they're not too large
              if (fullResults.length < 30000) {
                console.log(`📤 Sending full results (${fullResults.length} chars)`)
                controller.enqueue(encoder.encode(`data: ${fullResults}\n\n`))
              } else {
                console.log(`⚠️ Results too large (${fullResults.length} chars), frontend should use existing results`)
              }
              
              console.log(`✅ Completion messages sent, closing controller...`)
              controller.close()
              controllerClosed = true
            } catch (error) {
              console.error('Error sending completion:', error)
              controllerClosed = true
            }
          }

        } catch (error) {
          console.error('Translation error:', error)
          if (!controllerClosed) {
            try {
              const errorData = JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                progress: 0,
                message: 'Translation failed'
              })
              controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
              controller.close()
              controllerClosed = true
            } catch (closeError) {
              console.error('Error sending error message:', closeError)
              controllerClosed = true
            }
          }
        }
      })()
    },
    cancel() {
      console.log('🛑 Stream cancelled by client')
      controllerClosed = true
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}