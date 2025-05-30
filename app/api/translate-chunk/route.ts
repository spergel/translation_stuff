import { NextRequest, NextResponse } from 'next/server'
import { TranslationResult } from '../../types/translation'

interface ChunkTranslationRequest {
  text: string
  pageNumber: number
  targetLanguage: string
  imageData?: string // Base64 image data
  totalPages: number
  filename: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ChunkTranslationRequest = await request.json()
    const { text, pageNumber, targetLanguage, imageData, totalPages, filename } = body

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`🔤 Processing text chunk for page ${pageNumber}/${totalPages} of ${filename}`)
    console.log(`📝 Text length: ${text.length} characters`)
    console.log(`🖼️ Has image: ${!!imageData}`)

    // Prepare the translation request
    const parts: any[] = [
      {
        text: `Please translate this ${targetLanguage === 'chinese' ? 'to Traditional Chinese' : 
               targetLanguage === 'english' ? 'to English' : 
               targetLanguage === 'japanese' ? 'to Japanese' : 
               targetLanguage === 'korean' ? 'to Korean' : 
               'to the target language'} while preserving the original structure, formatting, and meaning. 
               Maintain any special formatting, bullet points, headers, etc.
               
               Text to translate:
               ${text}`
      }
    ]

    // Add image if provided
    if (imageData) {
      parts.unshift({
        inlineData: {
          mimeType: "image/png",
          data: imageData.split(',')[1] // Remove data:image/png;base64, prefix
        }
      })
      parts[1].text = `Please analyze this image and translate any text you see ${targetLanguage === 'chinese' ? 'to Traditional Chinese' : 
                       targetLanguage === 'english' ? 'to English' : 
                       targetLanguage === 'japanese' ? 'to Japanese' : 
                       targetLanguage === 'korean' ? 'to Korean' : 
                       'to the target language'}. Also translate the extracted text below:
                       
                       ${text}`
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

    console.log(`🌐 Making translation request for page ${pageNumber}...`)
    const startTime = Date.now()

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000) // 30 second timeout
    })

    const endTime = Date.now()
    console.log(`📥 Translation response for page ${pageNumber}: ${response.status} (${endTime - startTime}ms)`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Translation API error for page ${pageNumber}:`, response.status, errorText)
      return NextResponse.json({ 
        error: `Translation failed for page ${pageNumber}: ${response.status}` 
      }, { status: response.status })
    }

    const result = await response.json()
    const translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!translatedText) {
      console.error(`❌ No translation received for page ${pageNumber}`)
      return NextResponse.json({ 
        error: `No translation received for page ${pageNumber}` 
      }, { status: 500 })
    }

    console.log(`✅ Translation completed for page ${pageNumber} (${translatedText.length} chars)`)

    // Create translation result
    const translationResult: TranslationResult = {
      page_number: pageNumber,
      original_text: text,
      translated_text: translatedText,
      page_image: imageData || '',
      notes: `Translated from page ${pageNumber} of ${totalPages} (${endTime - startTime}ms)`
    }

    return NextResponse.json({ 
      success: true, 
      result: translationResult 
    })

  } catch (error) {
    console.error('❌ Chunk translation error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown translation error' 
    }, { status: 500 })
  }
} 