// Core translation processing logic
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-serverless'
import { TranslationResult } from '../types/translation'
import { TIER_CONFIGS, TierConfig } from '../config/tiers'
import { extractPageImageFromPDF } from './imageExtraction'
import { fixBrokenJSON } from './jsonUtils'

// Helper function to extract page count from PDF
export async function getPDFPageCount(fileData: Uint8Array): Promise<number> {
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
export async function processSinglePage(
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

  // 🚨 DETAILED LOGGING: What we're sending to LLM
  console.log(`\n🤖 LLM REQUEST FOR PAGE ${pageNum}:`)
  console.log(`📝 Prompt text:`)
  console.log(`"${pagePrompt}"`)
  console.log(`📄 PDF data: ${pdfDataForGemini.length} base64 chars (${Math.round(pdfDataForGemini.length * 0.75 / 1024 / 1024 * 100) / 100} MB)`)
  console.log(`🎛️ Generation config: temp=${requestBody.generationConfig.temperature}, maxTokens=${requestBody.generationConfig.maxOutputTokens}`)
  console.log(`📋 Expected JSON schema: page_number, original_text, translated_text`)

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
  
  // 🚨 DETAILED LOGGING: What the LLM extracted and returned
  console.log(`\n🤖 LLM RESPONSE FOR PAGE ${pageNum}:`)
  console.log(`📋 Raw response text (first 500 chars):`)
  console.log(`"${responseText?.substring(0, 500)}${responseText && responseText.length > 500 ? '...' : ''}"`)
  console.log(`📊 Total response length: ${responseText?.length || 0} characters`)
  
  // 🚨 DEBUG: Check full response structure
  console.log(`\n🔍 FULL RESPONSE STRUCTURE FOR PAGE ${pageNum}:`)
  console.log(`📋 Response keys:`, Object.keys(result))
  console.log(`📋 Full response (first 1000 chars):`, JSON.stringify(result).substring(0, 1000))
  
  // 🚨 NEW: TOKEN USAGE LOGGING
  if (result.usageMetadata) {
    console.log(`\n💰 TOKEN USAGE FOR PAGE ${pageNum}:`)
    console.log(`📥 Prompt tokens: ${result.usageMetadata.promptTokenCount || 'N/A'}`)
    console.log(`📤 Completion tokens: ${result.usageMetadata.candidatesTokenCount || 'N/A'}`)
    console.log(`🔢 Total tokens: ${result.usageMetadata.totalTokenCount || 'N/A'}`)
    
    // Calculate cost estimate (Gemini 1.5 Flash pricing)
    const totalTokens = result.usageMetadata.totalTokenCount || 0
    const estimatedCost = (totalTokens / 1000000) * 0.075 // $0.075 per 1M tokens for input
    console.log(`💵 Estimated cost: $${estimatedCost.toFixed(6)} (at $0.075/1M tokens)`)
    
    // Log PDF-specific token breakdown
    const pdfSizeTokens = Math.round(pdfDataForGemini.length * 0.75 / 1024 / 4) // Rough estimate: 4 chars per token
    console.log(`📄 PDF data estimated tokens: ~${pdfSizeTokens}`)
    console.log(`📝 Prompt text estimated tokens: ~${pagePrompt.length / 4}`)
  } else {
    console.log(`⚠️ No token usage metadata available in response`)
    console.log(`🔍 Looking for other token fields...`)
    
    // Check for alternative token field names
    const possibleTokenFields = ['usage', 'metadata', 'tokenCount', 'usage_metadata', 'tokens']
    possibleTokenFields.forEach(field => {
      if (result[field]) {
        console.log(`  Found ${field}:`, result[field])
      }
    })
  }
  
  if (!responseText) {
    throw new Error(`No response text for page ${pageNum}`)
  }

  // With structured output, we should get clean JSON directly
  let pageData: any
  try {
    pageData = JSON.parse(responseText)
    
    // 🚨 DETAILED LOGGING: What the LLM extracted from the PDF
    console.log(`\n✅ PARSED LLM EXTRACTION FOR PAGE ${pageNum}:`)
    console.log(`📄 Page number from LLM: ${pageData.page_number}`)
    console.log(`📝 Original text extracted (${pageData.original_text?.length || 0} chars):`)
    console.log(`"${pageData.original_text?.substring(0, 300)}${pageData.original_text && pageData.original_text.length > 300 ? '...' : ''}"`)
    console.log(`🌍 Translated text (${pageData.translated_text?.length || 0} chars):`)
    console.log(`"${pageData.translated_text?.substring(0, 300)}${pageData.translated_text && pageData.translated_text.length > 300 ? '...' : ''}"`)
    console.log(`📊 Extraction quality: ${pageData.original_text?.length > 10 ? 'Good' : 'Poor/Empty'}`)
    
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

  // 🚨 DETAILED LOGGING: Final page result summary
  console.log(`\n📋 FINAL PAGE ${pageNum} SUMMARY:`)
  console.log(`📝 Original text: ${pageData.original_text?.length || 0} chars`)
  console.log(`🌍 Translated text: ${pageData.translated_text?.length || 0} chars`)
  console.log(`🖼️ Page image: ${pageImage ? Math.round(pageImage.length / 1000) : 0}KB`)
  console.log(`📸 Image source: ${clientImages && clientImages[pageNum] ? 'CLIENT (pre-extracted)' : pageImage ? 'SERVER (extracted)' : 'NONE'}`)

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
export async function processBatchOfPages(
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
export async function processIndividualPagesSplit(
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
  
  // 🚨 NEW: Track total token usage and cost
  let totalTokensUsed = 0
  let totalCostEstimate = 0
  
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
    
    // 🚨 NEW: Log total token usage and cost summary
    console.log(`\n💰 TOTAL TOKEN USAGE SUMMARY:`)
    console.log(`📊 Total pages processed: ${results.length}`)
    console.log(`🔢 Total tokens used: ${totalTokensUsed}`)
    console.log(`💵 Total estimated cost: $${totalCostEstimate.toFixed(6)}`)
    if (results.length > 0) {
      console.log(`📈 Average tokens per page: ${Math.round(totalTokensUsed / results.length)}`)
      console.log(`💰 Average cost per page: $${(totalCostEstimate / results.length).toFixed(6)}`)
    }
    
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