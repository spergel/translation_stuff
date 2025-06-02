import { NextRequest, NextResponse } from 'next/server'
import { TranslationResult } from '../../types/translation'

interface ChunkTranslationRequest {
  text: string
  pageNumber: number
  targetLanguage: string
  imageData?: string // Base64 image data
  totalPages: number
  filename: string
  imageOnly?: boolean // Flag for image-only processing
}

export async function POST(request: NextRequest) {
  try {
    let body: ChunkTranslationRequest
    
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError)
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }
    
    const { text, pageNumber, targetLanguage, imageData, totalPages, filename, imageOnly } = body

    console.log(`🔍 API request received:`, {
      pageNumber,
      targetLanguage,
      hasImageData: !!imageData,
      textLength: text?.length || 0,
      imageOnly,
      filename: filename?.substring(0, 50) + '...'
    })

    // For image-only processing, we need image data
    if (imageOnly && !imageData) {
      console.error(`❌ Image-only processing requested but no image data provided for page ${pageNumber}`)
      return NextResponse.json({ error: 'Image data required for image-only processing' }, { status: 400 })
    }

    // Validate image data format if provided
    if (imageData && !imageData.startsWith('data:image/')) {
      console.error(`❌ Invalid image data format for page ${pageNumber}. Expected data:image/ prefix`)
      return NextResponse.json({ error: 'Invalid image data format. Expected base64 data URL' }, { status: 400 })
    }

    // For text-based processing, we need text
    if (!imageOnly && (!text || text.length === 0)) {
      console.error(`❌ Text-based processing requested but no text provided for page ${pageNumber}`)
      return NextResponse.json({ error: 'Text required for text-based processing' }, { status: 400 })
    }

    if (!targetLanguage) {
      console.error(`❌ No target language provided for page ${pageNumber}`)
      return NextResponse.json({ error: 'Target language is required' }, { status: 400 })
    }

    if (!pageNumber || !totalPages || !filename) {
      console.error(`❌ Missing required fields for page ${pageNumber}:`, { pageNumber, totalPages, filename })
      return NextResponse.json({ error: 'Missing required fields: pageNumber, totalPages, or filename' }, { status: 400 })
    }

    console.log(`✅ Validation passed for page ${pageNumber}`)
    console.log(`🔤 Processing ${imageOnly ? 'image-only' : 'text+image'} chunk for page ${pageNumber}/${totalPages} of ${filename}`)
    console.log(`📝 Text length: ${text?.length || 0} characters`)
    console.log(`🖼️ Has image: ${!!imageData}`)
    console.log(`🎯 Mode: ${imageOnly ? 'Gemini native image understanding' : 'Traditional text+image'}`)

    // Prepare the translation request based on processing mode
    const parts: any[] = []

    if (imageOnly && imageData) {
      // Image-only processing using Gemini's native image understanding
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: imageData.split(',')[1] // Remove data:image/png;base64, prefix
        }
      })
      
      // Enhanced prompt for direct image understanding and translation
      const targetLangName = {
        'chinese': 'Traditional Chinese',
        'english': 'English',
        'japanese': 'Japanese',
        'korean': 'Korean',
        'spanish': 'Spanish',
        'french': 'French',
        'german': 'German',
        'italian': 'Italian',
        'portuguese': 'Portuguese',
        'russian': 'Russian',
        'arabic': 'Arabic'
      }[targetLanguage] || 'the target language'

      parts.push({
        text: `Extract ALL text from this image and translate it to ${targetLangName}. 
               Be thorough in extraction and accurate in translation.
               Page ${pageNumber} of ${totalPages} from "${filename}".`
      })
    } else {
      // Traditional text-based processing (fallback)
      const targetLangName = {
        'chinese': 'Traditional Chinese',
        'english': 'English', 
        'japanese': 'Japanese',
        'korean': 'Korean',
        'spanish': 'Spanish',
        'french': 'French',
        'german': 'German',
        'italian': 'Italian',
        'portuguese': 'Portuguese',
        'russian': 'Russian',
        'arabic': 'Arabic'
      }[targetLanguage] || 'the target language'

      if (imageData) {
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: imageData.split(',')[1]
          }
        })
      }

      parts.push({
        text: `Please translate this text to ${targetLangName} while preserving the original structure, formatting, and meaning. 
               Maintain any special formatting, bullet points, headers, etc.
               
               Text to translate:
               ${text}`
      })
    }

    const requestBody = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.1,
        maxOutputTokens: 8192,
        // Force structured JSON output - no commentary!
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            extracted_text: {
              type: "STRING",
              description: "All text content extracted from the image, preserving original structure"
            },
            translated_text: {
              type: "STRING", 
              description: "Clean translation of the extracted text with no analysis or commentary"
            },
            page_info: {
              type: "OBJECT",
              properties: {
                has_text: { type: "BOOLEAN" },
                content_type: { 
                  type: "STRING",
                  enum: ["text", "image", "diagram", "table", "mixed"]
                }
              },
              required: ["has_text", "content_type"]
            }
          },
          required: ["extracted_text", "translated_text", "page_info"],
          propertyOrdering: ["extracted_text", "translated_text", "page_info"]
        }
      }
    }

    console.log(`🌐 Making ${imageOnly ? 'image understanding' : 'translation'} request for page ${pageNumber} with structured output...`)
    const startTime = Date.now()

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000) // 45 second timeout for image processing
    })

    const endTime = Date.now()
    console.log(`📥 Structured ${imageOnly ? 'image processing' : 'translation'} response for page ${pageNumber}: ${response.status} (${endTime - startTime}ms)`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Gemini API error for page ${pageNumber}:`, response.status, errorText)
      return NextResponse.json({ 
        error: `${imageOnly ? 'Image processing' : 'Translation'} failed for page ${pageNumber}: ${response.status}` 
      }, { status: response.status })
    }

    const result = await response.json()
    const structuredResponse = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!structuredResponse) {
      console.error(`❌ No structured response received for page ${pageNumber}`)
      return NextResponse.json({ 
        error: `No structured response received for page ${pageNumber}` 
      }, { status: 500 })
    }

    // Parse the structured JSON response
    let parsedResult
    try {
      parsedResult = JSON.parse(structuredResponse)
    } catch (parseError) {
      console.error(`❌ Failed to parse structured response for page ${pageNumber}:`, parseError)
      console.error('Broken structuredResponse:', structuredResponse?.slice(0, 500) + (structuredResponse?.length > 500 ? '... (truncated)' : ''))
      // Try to trim to last closing brace
      let fixed = structuredResponse
      const lastBrace = fixed.lastIndexOf('}')
      if (lastBrace !== -1) {
        fixed = fixed.slice(0, lastBrace + 1)
        try {
          parsedResult = JSON.parse(fixed)
          console.warn('✅ Successfully parsed after trimming to last }')
        } catch (e2) {
          return NextResponse.json({ 
            error: `Failed to parse structured response for page ${pageNumber} (even after trimming)` 
          }, { status: 500 })
        }
      } else {
        return NextResponse.json({ 
          error: `Failed to parse structured response for page ${pageNumber} (no closing brace)` 
        }, { status: 500 })
      }
    }

    const { extracted_text, translated_text, page_info } = parsedResult

    console.log(`✅ Structured ${imageOnly ? 'image processing' : 'translation'} completed for page ${pageNumber}:`, {
      extractedLength: extracted_text?.length || 0,
      translatedLength: translated_text?.length || 0,
      hasText: page_info?.has_text,
      contentType: page_info?.content_type
    })

    // Create translation result with structured data
    const translationResult: TranslationResult = {
      page_number: pageNumber,
      original_text: extracted_text || (imageOnly ? '[Extracted from image]' : text),
      translated_text: translated_text || '[No translation available]',
      page_image: imageData || '',
      notes: `${imageOnly ? 'Processed using structured Gemini image understanding' : 'Translated with structured output'} (${endTime - startTime}ms) - Content: ${page_info?.content_type || 'unknown'}`
    }

    return NextResponse.json({ 
      success: true, 
      result: translationResult 
    })

  } catch (error) {
    console.error('❌ Translation processing error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown translation error' 
    }, { status: 500 })
  }
}