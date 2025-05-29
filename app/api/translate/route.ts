import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

// Vercel-compatible PDF-to-image conversion using PDF.js and virtual canvas
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
const { JSDOM } = require('jsdom')

// Set up virtual DOM for serverless environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
const { window } = dom
global.window = window as any
global.document = window.document
global.HTMLCanvasElement = window.HTMLCanvasElement
global.ImageData = window.ImageData

// Configure PDF.js for serverless use
// Server-side MUST disable workers - can't access public HTTP paths
console.log('📝 Disabling PDF.js workers for server-side processing')
pdfjsLib.GlobalWorkerOptions.workerSrc = null

// Vercel-compatible image extraction using PDF.js + virtual canvas
async function extractPageImageFromPDF(fileData: Uint8Array, pageNumber: number): Promise<string> {
  try {
    console.log(`🖼️ Extracting image for page ${pageNumber} using PDF.js + virtual canvas (Vercel-compatible)...`)
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ 
      data: fileData,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      disableWorker: true  // Explicitly disable workers for server-side
    })
    
    const pdf = await loadingTask.promise
    
    if (pageNumber > pdf.numPages) {
      console.warn(`⚠️ Page ${pageNumber} requested but PDF only has ${pdf.numPages} pages`)
      return ''
    }
    
    // Get the specific page
    const page = await pdf.getPage(pageNumber)
    
    // Set up viewport with good quality (2x scale like your Python script)
    const viewport = page.getViewport({ scale: 2.0 })
    
    // Create virtual canvas using jsdom
    const canvas = window.document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    
    if (!context) {
      throw new Error('Failed to get canvas context')
    }
    
    // Render PDF page to virtual canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    }
    
    await page.render(renderContext).promise
    
    // Convert canvas to base64 PNG
    const dataUrl = canvas.toDataURL('image/png')
    
    console.log(`✅ Extracted image for page ${pageNumber} using virtual canvas (${dataUrl.length} chars)`)
    return dataUrl
    
  } catch (error) {
    console.warn(`⚠️ Image extraction failed for page ${pageNumber}, continuing without image:`, error instanceof Error ? error.message : String(error))
    // Gracefully fallback: return empty string so translation can continue without image
    // This ensures the translation always works even if image extraction fails
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
    const pdfDoc = await PDFDocument.load(fileData)
    return pdfDoc.getPageCount()
  } catch (error) {
    console.error('Error getting PDF page count:', error)
    return 1
  }
}

// Helper function to process a single page
async function processSinglePage(
  originalPdf: any,
  fileData: Uint8Array,
  pageNum: number,
  targetLanguage: string,
  totalPages: number,
  progressCallback?: (progress: number, message: string) => void
): Promise<TranslationResult> {
  console.log(`📄 Creating single-page PDF for page ${pageNum}...`)

  if (progressCallback) {
    progressCallback(0, `Starting page ${pageNum}...`)
  }

  // Create a new PDF with just this page
  const singlePagePdf = await PDFDocument.create()
  const [copiedPage] = await singlePagePdf.copyPages(originalPdf, [pageNum - 1])
  singlePagePdf.addPage(copiedPage)

  // Convert to bytes
  const singlePageBytes = await singlePagePdf.save()
  const singlePageBase64 = Buffer.from(singlePageBytes).toString('base64')
  const singlePageSizeMB = Math.round(singlePageBytes.length / (1024 * 1024) * 100) / 100

  console.log(`📤 Sending page ${pageNum} as ${singlePageSizeMB} MB PDF`)

  // STRUCTURED OUTPUT PROMPT - using Gemini's built-in JSON schema
  const pagePrompt = `You are processing PAGE ${pageNum} of a ${totalPages}-page document.

Extract and translate this page to ${targetLanguage}. 

IMPORTANT: This is page number ${pageNum}. Please return this exact page number in your response.

Extract the original text from this page and provide a clear translation. Use newlines (\\n) to separate paragraphs and maintain the document structure.`

  if (progressCallback) {
    progressCallback(20, `Translating page ${pageNum}...`)
  }

  const requestStartTime = Date.now()

  // Send the single-page PDF with structured output schema
  const requestBody = {
    contents: [
      {
        parts: [
          { text: pagePrompt },
          { 
            inlineData: {
              mimeType: 'application/pdf',
              data: singlePageBase64
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
  
  console.log(`📋 Structured JSON response for page ${pageNum}:`, responseText?.substring(0, 200))
  
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
    progressCallback(90, `Page ${pageNum} translation complete, extracting image...`)
  }

  const pageImage = await extractPageImageFromPDF(fileData, pageNum)

  if (progressCallback) {
    progressCallback(100, `Page ${pageNum} complete with ${pageImage ? 'image' : 'text only'}`)
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
      has_images: false,
      special_elements: []
    },
    notes: undefined,
    page_image: pageImage
  }
}

// BATCH PROCESSING: Process multiple pages concurrently
async function processBatchOfPages(
  originalPdf: any,
  fileData: Uint8Array,
  pageNumbers: number[],
  targetLanguage: string,
  totalPages: number,
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
      processSinglePage(originalPdf, fileData, pageNum, targetLanguage, totalPages, (pageProgress, pageMessage) => {
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
  progressCallback: (progress: number, message: string) => void,
  resultCallback?: (result: TranslationResult) => void // Add callback for individual results
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = []
  const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
  
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
  console.log(`   - Extract images: enabled (with fallback to text-only for reliability)`)

  try {
    // Load the original PDF
    const originalPdf = await PDFDocument.load(fileData)
    console.log(`📄 Original PDF loaded successfully, ${originalPdf.getPageCount()} pages`)

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
        
        const batchResults = await processBatchOfPages(
          originalPdf,
          fileData,
          batch,
          targetLanguage,
          totalPages,
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
          console.log(`📄 Processing page ${pageNum}/${maxPagesToProcess} (sequential)...`)

          const pageResult = await processSinglePage(originalPdf, fileData, pageNum, targetLanguage, totalPages, (pageProgress, pageMessage) => {
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

    const totalDataSent = results.length * (fileSizeMB / totalPages)
    console.log(`🏁 Processing complete. Total data sent: ~${Math.round(totalDataSent * 100) / 100} MB`)
    
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
          
          if (!file) {
            throw new Error('No file provided')
          }

          sendUpdate(1, 'Reading PDF file...')
          const fileData = new Uint8Array(await file.arrayBuffer())
          
          sendUpdate(3, 'Analyzing PDF structure...')
          const totalPages = await getPDFPageCount(fileData)
          
          const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
          const maxPagesToProcess = tierConfig.maxPages === -1 ? totalPages : Math.min(totalPages, tierConfig.maxPages)
          
          sendUpdate(5, `Found ${totalPages} pages. Processing ${maxPagesToProcess} pages with ${tierConfig.name} tier...`)

          const results = await processIndividualPagesSplit(
            fileData,
            targetLanguage,
            totalPages,
            userTier,
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