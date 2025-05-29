import { NextRequest, NextResponse } from 'next/server'
import { TranslationResult } from '../../types/translation'
import { initializeServerlessEnvironment } from '../../utils/serverlessPolyfills'
import { getPDFPageCount, processIndividualPagesSplit } from '../../utils/translationProcessor'

// Initialize serverless environment
initializeServerlessEnvironment()

interface TranslationResponse {
  document_title: string
  total_pages: number
  target_language: string
  translations: TranslationResult[]
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
              
              // 🚨 DETAILED LOGGING: Client images received
              console.log(`\n📸 CLIENT IMAGES RECEIVED:`)
              console.log(`📊 Total images from client: ${Object.keys(clientImages).length}`)
              
              Object.entries(clientImages).forEach(([pageNum, imageDataUrl]) => {
                const sizeKB = Math.round(imageDataUrl.length * 0.75 / 1024)
                console.log(`  📄 Page ${pageNum}: ${sizeKB}KB (${imageDataUrl.length} chars)`)
              })
              
              const totalClientImageSize = Object.values(clientImages).reduce((sum, img) => sum + img.length, 0)
              console.log(`💾 Total client images payload: ${Math.round(totalClientImageSize * 0.75 / 1024)}KB`)
              
              console.log(`📸 Received ${Object.keys(clientImages).length} pre-extracted images from client`)
            }
          } catch (error) {
            console.log('⚠️ No pre-extracted images or parsing failed, will use server-side extraction')
            console.log(`🔍 Pre-extracted images error:`, error)
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
          
          sendUpdate(5, `Found ${totalPages} pages. Starting translation with ${userTier} tier...`)

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
                  user_tier: userTier,
                  has_results: true
                },
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