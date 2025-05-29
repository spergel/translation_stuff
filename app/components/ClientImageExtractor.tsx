'use client'

import { useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker for client-side (this works in browsers)
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

interface ExtractedPage {
  pageNumber: number
  imageDataUrl: string
}

interface ClientImageExtractorProps {
  pdfFile: File
  onImagesExtracted: (images: ExtractedPage[]) => void
  onError: (error: string) => void
}

export default function ClientImageExtractor({ 
  pdfFile, 
  onImagesExtracted, 
  onError 
}: ClientImageExtractorProps) {
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(0)

  const extractImages = async () => {
    if (!pdfFile) return
    
    setExtracting(true)
    setProgress(0)
    
    try {
      console.log('📄 Client-side image extraction starting...')
      
      // Read the PDF file
      const arrayBuffer = await pdfFile.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array })
      const pdf = await loadingTask.promise
      
      console.log(`📄 PDF loaded: ${pdf.numPages} pages`)
      
      const extractedImages: ExtractedPage[] = []
      
      // Extract each page as image
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        console.log(`🖼️ Extracting page ${pageNum}/${pdf.numPages}...`)
        
        try {
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: 2.0 })
          
          // Create canvas
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')!
          canvas.height = viewport.height
          canvas.width = viewport.width
          
          // Render page to canvas
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          }
          
          await page.render(renderContext).promise
          
          // Convert to data URL
          const imageDataUrl = canvas.toDataURL('image/png')
          
          extractedImages.push({
            pageNumber: pageNum,
            imageDataUrl
          })
          
          // Update progress
          setProgress(Math.round((pageNum / pdf.numPages) * 100))
          
          console.log(`✅ Page ${pageNum} extracted (${imageDataUrl.length} chars)`)
          
        } catch (pageError) {
          console.error(`⚠️ Error extracting page ${pageNum}:`, pageError)
          // Continue with other pages
        }
      }
      
      console.log(`🎉 Client-side extraction complete: ${extractedImages.length} images`)
      onImagesExtracted(extractedImages)
      
    } catch (error) {
      console.error('❌ Client-side extraction failed:', error)
      onError(error instanceof Error ? error.message : 'Image extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-blue-50">
      <h3 className="font-semibold text-blue-800 mb-2">
        🖼️ Client-Side Image Extraction
      </h3>
      
      {!extracting && (
        <button
          onClick={extractImages}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Extract PDF Images (Client-Side)
        </button>
      )}
      
      {extracting && (
        <div className="space-y-2">
          <p className="text-blue-700">Extracting images... {progress}%</p>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
} 