// JSON parsing and fixing utilities

// Utility function for delays (consolidating repeated setTimeout patterns)
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// PDF validation utility (consolidating repeated header checks)
export function validatePDFHeader(fileData: Uint8Array, context: string = ''): void {
  const pdfHeader = String.fromCharCode.apply(null, Array.from(fileData.slice(0, 8)))
  console.log(`🔍 PDF header verification${context ? ` ${context}` : ''}: "${pdfHeader}"`)
  
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error(`Invalid PDF header${context ? ` ${context}` : ''}: ${pdfHeader}`)
  }
}

// Safe Uint8Array copying utility (prevents corruption from PDF libraries)
export function safeCopyPDFData(originalData: Uint8Array, context: string = ''): Uint8Array {
  console.log(`🔧 Creating safe copy of PDF data${context ? ` ${context}` : ''}: ${originalData.length} bytes`)
  const copy = new Uint8Array(originalData.length)
  copy.set(originalData)
  console.log(`✅ Safe copy created${context ? ` ${context}` : ''}: ${copy.length} bytes`)
  return copy
}

// Error result creation utility (consolidating repeated error result patterns)
export function createErrorResult(pageNumber: number, errorMessage: string, context: string = ''): any {
  return {
    page_number: pageNumber,
    original_text: context || 'Page processing encountered an issue',
    translated_text: errorMessage,
    layout_structure: {
      page_type: 'error_page',
      sections: [{
        type: 'paragraph',
        content: errorMessage,
        formatting: 'normal',
        position: 'left'
      }],
      columns: 1,
      has_images: false,
      special_elements: []
    },
    notes: `Page ${pageNumber}${context ? ` - ${context}` : ''}: ${errorMessage}`,
    page_image: ''
  }
}

// Backup function to fix broken JSON responses
export async function fixBrokenJSON(brokenText: string, pageNumber: number): Promise<any> {
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
          maxOutputTokens: 8000
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