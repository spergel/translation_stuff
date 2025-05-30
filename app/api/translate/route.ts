import { NextRequest, NextResponse } from 'next/server'
import { TranslationResult } from '../../types/translation'
import { initializeServerlessEnvironment } from '../../utils/serverlessPolyfills'
import { getPDFPageCount, processDocumentSmart } from '../../utils/translationProcessor'

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
          const extractImages = formData.get('extractImages') !== 'false'
          
          console.log(`🚀 Starting translation processing with ${extractImages ? 'images' : 'text-only'}`)
          
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
            
          } catch (fileError) {
            console.error('❌ File reading error:', fileError)
            throw new Error(`Failed to read PDF file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`)
          }
          
          sendUpdate(3, 'Analyzing PDF structure...')
          
          // Create a defensive copy for page count to prevent corruption
          const fileDataForPageCount = new Uint8Array(fileData.length)
          fileDataForPageCount.set(fileData)
          
          const totalPages = await getPDFPageCount(fileDataForPageCount)
          
          sendUpdate(5, `Found ${totalPages} pages. Starting translation with ${userTier} tier...`)

          // Create another defensive copy for processing
          const fileDataForProcessing = new Uint8Array(fileData.length)
          fileDataForProcessing.set(fileData)
          
          const results = await processDocumentSmart(
            fileDataForProcessing,
            targetLanguage,
            totalPages,
            userTier,
            {}, // No pre-extracted images - backend handles everything
            sendUpdate,
            result => {
              // Send individual result to frontend when page completes
              if (!controllerClosed) {
                try {
                  const resultData = JSON.stringify({
                    type: 'translation',
                    translation: result,
                    progress: Math.round((result.page_number / totalPages) * 90) + 5,
                    message: `Completed page ${result.page_number}/${totalPages}`,
                    total_pages: totalPages,
                    current_page: result.page_number
                  })
                  
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
              
              // Create a truly lightweight completion message (no results array)
              const lightweightCompletion = JSON.stringify({
                type: 'complete',
                progress: 100,
                message: `Translation complete! Processed ${results.length} pages.`,
                metadata: {
                  total_pages: totalPages,
                  processed_pages: results.length,
                  user_tier: userTier,
                  job_id: '',
                  has_results: true
                },
                resultsCount: results.length,
                hasResults: true
                // NOTE: Results are not included here to keep message small
                // Individual results were already sent via resultCallback during processing
              })
              
              console.log(`📤 Lightweight completion message size: ${lightweightCompletion.length} chars`)
              controller.enqueue(encoder.encode(`data: ${lightweightCompletion}\n\n`))
              
              // Send a separate small summary message if helpful
              const summaryMessage = JSON.stringify({
                type: 'summary',
                total_pages: totalPages,
                processed_pages: results.length,
                successful_pages: results.filter(r => !r.notes?.includes('error')).length,
                error_pages: results.filter(r => r.notes?.includes('error')).length,
                message: 'All individual page results have been sent. Processing complete.'
              })
              
              console.log(`📤 Sending processing summary (${summaryMessage.length} chars)`)
              controller.enqueue(encoder.encode(`data: ${summaryMessage}\n\n`))
              
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