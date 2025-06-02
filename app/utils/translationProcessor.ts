// Core translation processing logic
import { PDFDocument as PDFLibDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-serverless'
import { TranslationResult } from '../types/translation'
import { TIER_CONFIGS, TierConfig } from '../config/tiers'
import { fixBrokenJSON } from './jsonUtils'
import { 
  splitPDFIntoChunks, 
  mergeChunkResults, 
  getChunkProcessingStrategy, 
  processChunksInBatches,
  DocumentChunk,
  ChunkResult 
} from './documentChunking'

// Validation function to check if translation actually occurred
function validateTranslation(originalText: string, translatedText: string, targetLanguage: string, pageNum: number): boolean {
  if (!originalText || !translatedText) {
    console.log(`❌ Page ${pageNum}: Missing text - original: ${!!originalText}, translated: ${!!translatedText}`)
    return false
  }

  // Check if texts are identical (likely means no translation occurred)
  if (originalText.trim() === translatedText.trim()) {
    console.log(`❌ Page ${pageNum}: Translation identical to original - likely not translated`)
    return false
  }

  // Check if the translation is too similar (simple similarity check)
  const similarity = calculateStringSimilarity(originalText, translatedText)
  if (similarity > 0.9) {
    console.log(`❌ Page ${pageNum}: Translation too similar to original (${Math.round(similarity * 100)}% similar)`)
    return false
  }

  // Basic language detection - check for common non-English characters if target is English
  if (targetLanguage.toLowerCase() === 'english') {
    // Check for Cyrillic (Russian, etc.)
    const cyrillicPattern = /[А-Яа-яЁё]/
    // Check for Chinese/Japanese characters
    const cjkPattern = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/
    // Check for Arabic script
    const arabicPattern = /[\u0600-\u06ff]/
    // Check for other common non-Latin scripts
    const otherPattern = /[\u0370-\u03ff\u0590-\u05ff\u0900-\u097f]/
    
    if (cyrillicPattern.test(translatedText)) {
      console.log(`❌ Page ${pageNum}: Translation contains Cyrillic characters when English was requested`)
      return false
    }
    if (cjkPattern.test(translatedText)) {
      console.log(`❌ Page ${pageNum}: Translation contains CJK characters when English was requested`)
      return false
    }
    if (arabicPattern.test(translatedText)) {
      console.log(`❌ Page ${pageNum}: Translation contains Arabic characters when English was requested`)
      return false
    }
    if (otherPattern.test(translatedText)) {
      console.log(`❌ Page ${pageNum}: Translation contains non-Latin characters when English was requested`)
      return false
    }
    
    // Check for common non-English words that indicate failed translation
    const commonNonEnglishWords = [
      // Russian
      'русский', 'текст', 'страница', 'документ', 'глава', 'часть',
      // German  
      'deutsch', 'seite', 'kapitel', 'teil', 'dokument',
      // French
      'français', 'texte', 'page', 'chapitre', 'partie',
      // Spanish
      'español', 'texto', 'página', 'capítulo', 'parte'
    ]
    
    const lowerTranslated = translatedText.toLowerCase()
    const foundNonEnglish = commonNonEnglishWords.find(word => lowerTranslated.includes(word))
    if (foundNonEnglish) {
      console.log(`❌ Page ${pageNum}: Translation contains non-English word "${foundNonEnglish}" when English was requested`)
      return false
    }
  }

  // Check minimum translation length (should be reasonably substantial)
  if (translatedText.trim().length < 10) {
    console.log(`❌ Page ${pageNum}: Translation too short (${translatedText.trim().length} chars)`)
    return false
  }

  console.log(`✅ Page ${pageNum}: Translation validation passed`)
  return true
}

// Helper function to calculate string similarity
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = getEditDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

// Helper function to calculate edit distance (Levenshtein distance)
function getEditDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null))
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      )
    }
  }
  
  return matrix[str2.length][str1.length]
}

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
  userTier: string = 'free',
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

CRITICAL TASK: You must do TWO separate steps:
1. EXTRACT the original text from this page exactly as it appears
2. TRANSLATE that text completely into ${targetLanguage}

TRANSLATION REQUIREMENTS:
- You MUST translate ALL text into ${targetLanguage}
- Do NOT leave any text in the original language in the translated_text field
- If the original text is already in ${targetLanguage}, still provide a clean version in translated_text
- Use proper ${targetLanguage} grammar and vocabulary
- Maintain the document structure with newlines (\\n) between paragraphs

IMPORTANT: This is page number ${pageNum}. Please return this exact page number in your response.

The original_text field should contain the exact text as it appears on the page.
The translated_text field should contain ONLY the ${targetLanguage} translation.

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
      maxOutputTokens: 8000,
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
            description: "The exact original text extracted from this page in its original language"
          },
          translated_text: {
            type: "STRING",
            description: `The complete translation of the original text into ${targetLanguage}. This MUST be in ${targetLanguage} and MUST NOT contain text in the original language.`
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
    const modelName = getModelForTier(userTier)
    console.log(`🤖 Using model ${modelName} for ${userTier} tier`)

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
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
    
    // 🚨 VALIDATION: Check if translation actually occurred
    const isTranslationValid = validateTranslation(pageData.original_text, pageData.translated_text, targetLanguage, pageNum)
    
    if (!isTranslationValid) {
      console.log(`⚠️ Translation validation failed for page ${pageNum}, attempting retry with stronger prompt...`)
      
      // Retry with more explicit prompt
      const retryPrompt = `URGENT: The previous translation attempt failed. You MUST translate this text.

ORIGINAL TEXT TO TRANSLATE:
${pageData.original_text}

TARGET LANGUAGE: ${targetLanguage}

You must provide a complete translation of the above text into ${targetLanguage}. Do not return the original text - only the translated version.

Respond with valid JSON in this exact format:
{
  "page_number": ${pageNum},
  "original_text": "${pageData.original_text?.replace(/"/g, '\\"') || ''}",
  "translated_text": "[YOUR TRANSLATION IN ${targetLanguage} HERE]"
}`

      try {
        const modelName = getModelForTier(userTier)
        console.log(`🤖 Retry using model ${modelName} for ${userTier} tier`)

        const retryResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: retryPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4000,
              responseMimeType: "application/json"
            }
          }),
          signal: AbortSignal.timeout(30000)
        })

        if (retryResponse.ok) {
          const retryResult = await retryResponse.json()
          const retryText = retryResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          
          if (retryText) {
            const retryData = JSON.parse(retryText)
            const retryValid = validateTranslation(retryData.original_text, retryData.translated_text, targetLanguage, pageNum)
            
            if (retryValid) {
              console.log(`✅ Translation retry succeeded for page ${pageNum}`)
              pageData = retryData
            } else {
              console.log(`❌ Translation retry also failed for page ${pageNum}`)
            }
          }
        }
      } catch (retryError) {
        console.error(`❌ Translation retry failed for page ${pageNum}:`, retryError)
      }
    }
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
  let pageImage = ''
  // Server-side image extraction disabled in serverless environment
  // Images can be added by client-side extraction if needed
  console.log(`📝 Page ${pageNum} processed text-only (serverless environment)`)

  if (progressCallback) {
    progressCallback(100, `Page ${pageNum} complete (text-only)`)
  }

  // 🚨 DETAILED LOGGING: Final page result summary
  console.log(`\n📋 FINAL PAGE ${pageNum} SUMMARY:`)
  console.log(`📝 Original text: ${pageData.original_text?.length || 0} chars`)
  console.log(`🌍 Translated text: ${pageData.translated_text?.length || 0} chars`)
  console.log(`🖼️ Page image: ${pageImage ? Math.round(pageImage.length / 1000) : 0}KB`)
  console.log(`📸 Image source: ${clientImages && clientImages[pageNum] ? 'CLIENT (pre-extracted)' : pageImage ? 'SERVER (extracted)' : 'NONE - TEXT ONLY'}`)
  console.log(`✅ Processing mode: ${pageImage ? 'TEXT + IMAGE' : 'TEXT-ONLY (reliable)'}`)

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
      processSinglePage(originalPdfBytes, pageNum, targetLanguage, totalPages, 'free', clientImages, (pageProgress, pageMessage) => {
        // Provide more granular progress updates for individual pages
        if (pageProgress >= 50) { // When a page is halfway done
          const totalCompleted = completedPagesCount + (completedInBatch + (pageProgress / 100))
          const overallProgress = Math.round((totalCompleted / totalPages) * 80) + 10
          
          if (pageProgress === 100) {
            completedInBatch++
            console.log(`✅ Page ${pageNum} completed: ${pageMessage}`)
            progressCallback(overallProgress, `Completed ${completedPagesCount + completedInBatch}/${totalPages} pages`)
          } else {
            // More frequent progress updates as pages are being processed
            progressCallback(overallProgress, `Processing page ${pageNum}... (${Math.round(pageProgress)}% done)`)
          }
        }
      }).then(result => {
        // Send individual result to frontend when page completes
        if (resultCallback) {
          resultCallback(result)
        }
        return result
      }).catch(pageError => {
        console.error(`❌ Page ${pageNum} failed in batch:`, pageError)
        // Return error result instead of throwing to prevent batch failure
        const errorResult = {
          page_number: pageNum,
          original_text: 'Individual page processing failed',
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
          notes: `Page ${pageNum} processing error: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`,
          page_image: ''
        }
        
        // Send error result to frontend
        if (resultCallback) {
          resultCallback(errorResult)
        }
        
        return errorResult
      })
    )
    
    // Wait for all pages in the batch to complete
    console.log(`⏳ Waiting for all ${pageNumbers.length} pages in batch to complete...`)
    const batchResults = await Promise.all(batchPromises)
    
    const batchEndTime = Date.now()
    const batchTime = Math.round((batchEndTime - batchStartTime) / 1000)
    const timePerPage = Math.round(batchTime / pageNumbers.length * 10) / 10
    
    console.log(`✅ BATCH COMPLETE: ${pageNumbers.length} pages in ${batchTime}s (${timePerPage}s per page)`)
    
    // Count successful vs error results
    const successfulResults = batchResults.filter(r => !r.notes?.includes('processing error'))
    const errorResults = batchResults.filter(r => r.notes?.includes('processing error'))
    
    console.log(`📊 Batch results: ${successfulResults.length} successful, ${errorResults.length} errors`)
    
    // Final batch completion update
    const newCompletedCount = completedPagesCount + pageNumbers.length
    const progress = Math.round((newCompletedCount / totalPages) * 80) + 10
    
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
        
        try {
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
          
          console.log(`✅ Batch ${batchIndex + 1} completed successfully with ${batchResults.length} pages`)
          console.log(`📊 Progress: ${results.length}/${maxPagesToProcess} pages completed`)
          
          // Small delay between batches to avoid overwhelming the API
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
          
        } catch (batchError) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, batchError)
          
          // Add error results for all pages in this batch
          batch.forEach(pageNum => {
            const errorResult = {
              page_number: pageNum,
              original_text: 'Batch processing encountered an issue',
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
              notes: `Page ${pageNum} - batch ${batchIndex + 1} processing issue: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`,
              page_image: ''
            }
            
            results.push(errorResult)
            
            // Send individual error result to frontend if callback provided
            if (resultCallback) {
              resultCallback(errorResult)
            }
          })
          
          console.log(`📊 Progress after batch error: ${results.length}/${maxPagesToProcess} pages completed`)
          
          // Continue to next batch even if this one failed
          continue
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

          const pageResult = await processSinglePage(fileDataCopyForPage, pageNum, targetLanguage, totalPages, userTier, clientImages, (pageProgress, pageMessage) => {
            // Provide more granular progress updates during sequential processing
            if (pageProgress >= 25) { // Update every 25% of page progress
              const overallProgress = Math.floor((pageNum - 1) / maxPagesToProcess * 100)
              progressCallback(overallProgress, pageMessage)
            }
          })
          results.push(pageResult)

          // Send individual result to frontend if callback provided
          if (resultCallback) {
            resultCallback(pageResult)
          }

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
          const progress = Math.round((results.length / maxPagesToProcess) * 80) + 10
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

// NEW: Chunked processing for large documents
export async function processDocumentWithChunking(
  fileData: Uint8Array,
  targetLanguage: string,
  totalPages: number,
  userTier: string = 'free',
  clientImages: Record<number, string> = {},
  progressCallback: (progress: number, message: string) => void,
  resultCallback?: (result: TranslationResult) => void
): Promise<TranslationResult[]> {
  console.log(`🧩 Starting chunked document processing for ${totalPages} pages...`)
  
  const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
  const strategy = getChunkProcessingStrategy(totalPages, userTier, 20)
  
  console.log(`📊 Chunking strategy:`, strategy)
  progressCallback(5, `Analyzing ${totalPages} pages, creating ${strategy.chunkCount} chunks...`)
  
  // Split document into chunks
  const chunks = await splitPDFIntoChunks(fileData, totalPages, 20)
  progressCallback(10, `Created ${chunks.length} chunks. Starting translation...`)
  
  // Process chunks with tier-based concurrency
  let completedChunks = 0
  let allResults: TranslationResult[] = []
  
  const processChunk = async (chunk: DocumentChunk): Promise<ChunkResult> => {
    console.log(`🔄 Processing chunk ${chunk.chunkIndex + 1}: pages ${chunk.startPage}-${chunk.endPage}`)
    
    // Create filtered client images for this chunk
    const chunkClientImages: Record<number, string> = {}
    for (let page = chunk.startPage; page <= chunk.endPage; page++) {
      if (clientImages[page]) {
        chunkClientImages[page] = clientImages[page]
      }
    }
    
    // Process this chunk using existing batch processing logic
    const chunkPageNumbers = Array.from(
      { length: chunk.pageCount }, 
      (_, i) => i + 1 // Use 1-based indexing within the chunk
    )
    
    const chunkTranslationResults = await processBatchOfPages(
      chunk.pdfData,
      chunkPageNumbers,
      targetLanguage,
      chunk.pageCount, // Total pages in this chunk
      {}, // Don't pass client images here since they're for the original document context
      (progress, message) => {
        // Update overall progress
        const chunkProgress = progress / 100
        const overallProgress = 10 + ((completedChunks + chunkProgress) / chunks.length) * 80
        progressCallback(
          Math.round(overallProgress), 
          `Chunk ${chunk.chunkIndex + 1}/${chunks.length}: ${message}`
        )
      },
      0, // No previously completed pages in chunk context
      (result) => {
        // Adjust page numbers back to original document context
        const adjustedResult: TranslationResult = {
          ...result,
          page_number: chunk.startPage + result.page_number - 1
        }
        
        // Send individual result to frontend
        if (resultCallback) {
          resultCallback(adjustedResult)
        }
      }
    )
    
    // Adjust page numbers in results to match original document
    const adjustedResults = chunkTranslationResults.map(result => ({
      ...result,
      page_number: chunk.startPage + result.page_number - 1
    }))
    
    completedChunks++
    console.log(`✅ Chunk ${chunk.chunkIndex + 1} complete: ${adjustedResults.length} pages`)
    
    return {
      chunkIndex: chunk.chunkIndex,
      results: adjustedResults,
      clientImages: chunkClientImages
    }
  }
  
  // 🚀 NEW: Process chunks asynchronously with batching for tier limits
  console.log(`🚀 Processing ${chunks.length} chunks with max concurrency: ${strategy.maxConcurrentChunks}`)
  
  const allChunkResults: ChunkResult[] = []
  
  // Process chunks in batches based on tier concurrency limits
  for (let i = 0; i < chunks.length; i += strategy.maxConcurrentChunks) {
    const chunkBatch = chunks.slice(i, i + strategy.maxConcurrentChunks)
    const batchNumber = Math.floor(i / strategy.maxConcurrentChunks) + 1
    const totalBatches = Math.ceil(chunks.length / strategy.maxConcurrentChunks)
    
    console.log(`🎯 Starting chunk batch ${batchNumber}/${totalBatches}: chunks ${chunkBatch.map(c => c.chunkIndex + 1).join(', ')} (${chunkBatch.length} chunks concurrent)`)
    
    // Process all chunks in this batch concurrently
    const batchPromises = chunkBatch.map(chunk => processChunk(chunk))
    const batchResults = await Promise.all(batchPromises)
    
    allChunkResults.push(...batchResults)
    
    console.log(`✅ Chunk batch ${batchNumber}/${totalBatches} complete: ${batchResults.length} chunks processed`)
    
    // Small delay between chunk batches to be nice to the API
    if (i + strategy.maxConcurrentChunks < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  progressCallback(90, `Merging results from ${chunks.length} chunks...`)
  
  // Merge all chunk results
  const finalResults = mergeChunkResults(allChunkResults)
  
  progressCallback(95, `Translation complete! Processed ${finalResults.length} pages.`)
  
  console.log(`🎉 Chunked processing complete: ${finalResults.length} pages from ${chunks.length} chunks`)
  return finalResults
}

// Enhanced main processing function that chooses between chunked and direct processing
export async function processDocumentSmart(
  fileData: Uint8Array,
  targetLanguage: string,
  totalPages: number,
  userTier: string = 'free',
  clientImages: Record<number, string> = {},
  progressCallback: (progress: number, message: string) => void,
  resultCallback?: (result: TranslationResult) => void
): Promise<TranslationResult[]> {
  const tierConfig = TIER_CONFIGS[userTier] || TIER_CONFIGS.free
  const maxPagesToProcess = tierConfig.maxPages === -1 ? totalPages : Math.min(totalPages, tierConfig.maxPages)
  
  console.log(`🤖 Smart processing decision for ${totalPages} pages (processing ${maxPagesToProcess})...`)
  
  // NEW: More aggressive async processing limits
  // Use direct processing for smaller docs OR if tier doesn't support high concurrency
  const shouldUseChunking = totalPages > 200 || (totalPages > 100 && tierConfig.batchSize < 3)
  
  if (shouldUseChunking) {
    console.log(`🧩 Using CHUNKED processing (${totalPages} pages, tier: ${tierConfig.name})`)
    console.log(`📋 Reason: Very large document or limited tier concurrency`)
    return await processDocumentWithChunking(
      fileData,
      targetLanguage,
      totalPages,
      userTier,
      clientImages,
      progressCallback,
      resultCallback
    )
  } else {
    console.log(`🚀 Using DIRECT ASYNC processing (${totalPages} pages, tier: ${tierConfig.name})`)
    console.log(`📋 Reason: Manageable size with good tier concurrency`)
    return await processIndividualPagesSplit(
      fileData,
      targetLanguage,
      totalPages,
      userTier,
      clientImages,
      progressCallback,
      resultCallback
    )
  }
}

// At the top of the file, add this new function for text-only processing
export async function processDocumentTextOnly(
  fileData: Uint8Array,
  targetLanguage: string,
  totalPages: number,
  userTier: string = 'free',
  progressCallback: (progress: number, message: string) => void,
  resultCallback?: (result: TranslationResult) => void
): Promise<TranslationResult[]> {
  console.log(`🚀 Starting text-only processing for ${totalPages} pages`)
  
  // Use the same logic as processDocumentSmart but force no images
  const emptyClientImages: Record<number, string> = {}
  
  return await processDocumentSmart(
    fileData,
    targetLanguage,
    totalPages,
    userTier,
    emptyClientImages,
    progressCallback,
    resultCallback
  )
}

// Helper function to get the appropriate model based on user tier
function getModelForTier(userTier: string): string {
  switch (userTier) {
    case 'pro':
    case 'enterprise':
      return 'gemini-2.0-flash'
    default:
      return 'gemini-1.5-flash-8b'
  }
} 