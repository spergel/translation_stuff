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
    const body: ChunkTranslationRequest = await request.json()
    const { text, pageNumber, targetLanguage, imageData, totalPages, filename, imageOnly } = body

    // For image-only processing, we need image data
    if (imageOnly && !imageData) {
      return NextResponse.json({ error: 'Image data required for image-only processing' }, { status: 400 })
    }

    // For text-based processing, we need text
    if (!imageOnly && !text) {
      return NextResponse.json({ error: 'Text required for text-based processing' }, { status: 400 })
    }

    if (!targetLanguage) {
      return NextResponse.json({ error: 'Target language is required' }, { status: 400 })
    }

    console.log(`🔤 Processing ${imageOnly ? 'image-only' : 'text+image'} chunk for page ${pageNumber}/${totalPages} of ${filename}`)
    console.log(`📝 Text length: ${text.length} characters`)
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
        text: `Please analyze this page image and perform the following tasks:

1. **READ ALL TEXT**: Carefully examine the entire image and extract ALL visible text, including:
   - Main content text
   - Headers and titles
   - Captions and footnotes
   - Table contents
   - Any small or subtle text
   - Text in diagrams or charts

2. **TRANSLATE EVERYTHING**: Translate all the extracted text to ${targetLangName}, while:
   - Preserving the original structure and formatting
   - Maintaining the meaning and context
   - Keeping any special formatting (bold, italic, etc.)
   - Preserving bullet points, numbering, and lists
   - Maintaining technical terms appropriately

3. **OUTPUT FORMAT**: Provide the translation in a clear, readable format that maintains the original document structure.

This is page ${pageNumber} of ${totalPages} from "${filename}". Please be thorough and accurate in both text extraction and translation.`
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
        maxOutputTokens: 8192
      }
    }

    console.log(`🌐 Making ${imageOnly ? 'image understanding' : 'translation'} request for page ${pageNumber}...`)
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
    console.log(`📥 ${imageOnly ? 'Image processing' : 'Translation'} response for page ${pageNumber}: ${response.status} (${endTime - startTime}ms)`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Gemini API error for page ${pageNumber}:`, response.status, errorText)
      return NextResponse.json({ 
        error: `${imageOnly ? 'Image processing' : 'Translation'} failed for page ${pageNumber}: ${response.status}` 
      }, { status: response.status })
    }

    const result = await response.json()
    const translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!translatedText) {
      console.error(`❌ No ${imageOnly ? 'image processing result' : 'translation'} received for page ${pageNumber}`)
      return NextResponse.json({ 
        error: `No ${imageOnly ? 'image processing result' : 'translation'} received for page ${pageNumber}` 
      }, { status: 500 })
    }

    console.log(`✅ ${imageOnly ? 'Image processing' : 'Translation'} completed for page ${pageNumber} (${translatedText.length} chars)`)

    // Create translation result
    const translationResult: TranslationResult = {
      page_number: pageNumber,
      original_text: imageOnly ? '[Extracted from image]' : text,
      translated_text: translatedText,
      page_image: imageData || '',
      notes: `${imageOnly ? 'Processed using Gemini native image understanding' : 'Translated'} from page ${pageNumber} of ${totalPages} (${endTime - startTime}ms)`
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