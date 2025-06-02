import { put, del, list, head } from '@vercel/blob'
import { TranslationResult } from '../types/translation'
import jsPDF from 'jspdf'
import { generateSideBySideHTML } from './htmlGenerators'

// File storage utilities for Vercel Blob
export class FileStorageManager {
  private static getBasePath(userId: string, documentId: string): string {
    return `users/${userId}/documents/${documentId}`
  }

  // Upload original PDF file
  static async uploadOriginalFile(
    userId: string,
    documentId: string,
    file: File
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/original/${file.name}`
    
    try {
      const blob = await put(pathname, file, {
        access: 'public',
        contentType: file.type,
      })
      
      console.log('📁 Uploaded original file:', blob.url)
      return { url: blob.url, pathname }
    } catch (error) {
      console.error('Failed to upload original file:', error)
      throw new Error('Failed to upload file to storage')
    }
  }

  // Generate and upload document thumbnail
  static async generateAndUploadThumbnail(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    originalFilename: string,
    targetLanguage: string
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/thumbnails/preview.png`
    
    try {
      // Generate thumbnail as a canvas-based image
      const thumbnailBlob = await this.generateThumbnailImage(results, originalFilename, targetLanguage)
      
      const blob = await put(pathname, thumbnailBlob, {
        access: 'public',
        contentType: 'image/png',
      })
      
      console.log('🖼️ Generated document thumbnail:', blob.url)
      return { url: blob.url, pathname }
    } catch (error) {
      console.error('Failed to generate thumbnail:', error)
      throw new Error('Failed to generate thumbnail')
    }
  }

  // Store translation results as JSON
  static async storeTranslationResults(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    metadata: {
      filename: string
      targetLanguage: string
      pageCount: number
      processingTimeMs: number
    }
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/results/translation-results.json`
    
    const data = {
      metadata,
      results,
      createdAt: new Date().toISOString(),
    }
    
    try {
      const blob = await put(pathname, JSON.stringify(data, null, 2), {
        access: 'public',
        contentType: 'application/json',
      })
      
      console.log('💾 Stored translation results:', blob.url)
      return { url: blob.url, pathname }
    } catch (error) {
      console.error('Failed to store translation results:', error)
      throw new Error('Failed to store translation results')
    }
  }

  // Generate and upload PDF from translation results
  static async generateAndUploadPDF(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    originalFilename: string
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/outputs/translated-${originalFilename}`
    
    try {
      // Generate PDF using jsPDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - (margin * 2)

      // Add title
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`Side-by-Side Translation: ${originalFilename}`, margin, margin + 10)

      let yPosition = margin + 30

      // Process each page
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        
        // Check if we need a new page
        if (yPosition > pageHeight - margin) {
          doc.addPage()
          yPosition = margin
        }

        // Add page number
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(`Page ${result.page_number}`, margin, yPosition)
        yPosition += 10

        // Add original text
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        const originalLines = doc.splitTextToSize(
          result.original_text || 'No original text available',
          contentWidth
        )
        doc.text(originalLines, margin, yPosition)
        yPosition += (originalLines.length * 5) + 10

        // Add translated text
        doc.setFont('helvetica', 'bold')
        doc.text('Translation:', margin, yPosition)
        yPosition += 5
        doc.setFont('helvetica', 'normal')
        const translatedLines = doc.splitTextToSize(
          result.translated_text,
          contentWidth
        )
        doc.text(translatedLines, margin, yPosition)
        yPosition += (translatedLines.length * 5) + 15

        // Add notes if any
        if (result.notes) {
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(100, 100, 100)
          const noteLines = doc.splitTextToSize(result.notes, contentWidth)
          doc.text(noteLines, margin, yPosition)
          yPosition += (noteLines.length * 5) + 10
          doc.setTextColor(0, 0, 0)
        }

        // Add separator line
        if (i < results.length - 1) {
          doc.setDrawColor(200, 200, 200)
          doc.line(margin, yPosition, pageWidth - margin, yPosition)
          yPosition += 10
        }
      }

      // Generate PDF buffer
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      
      // Upload to blob storage
      const blob = await put(pathname, pdfBuffer, {
        access: 'public',
        contentType: 'application/pdf',
      })
      
      console.log('📄 Generated translated PDF:', blob.url)
      return { url: blob.url, pathname }
    } catch (error) {
      console.error('Failed to generate or upload translated PDF:', error)
      throw new Error('Failed to generate or upload translated PDF')
    }
  }

  // Generate and upload HTML from translation results
  static async generateAndUploadHTML(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    originalFilename: string,
    targetLanguage: string
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/outputs/translated-${originalFilename.replace('.pdf', '.html')}`
    
    const htmlContent = this.generateHTMLContent(results, originalFilename, targetLanguage)
    
    try {
      const blob = await put(pathname, htmlContent, {
        access: 'public',
        contentType: 'text/html',
      })
      
      console.log('🌐 Generated translated HTML:', blob.url)
      return { url: blob.url, pathname }
    } catch (error) {
      console.error('Failed to upload translated HTML:', error)
      throw new Error('Failed to upload translated HTML')
    }
  }

  // Delete all files for a document
  static async deleteDocumentFiles(userId: string, documentId: string): Promise<void> {
    const basePath = this.getBasePath(userId, documentId)
    
    try {
      // List all files for this document
      const { blobs } = await list({ prefix: basePath })
      
      // Delete all files
      const deletePromises = blobs.map(blob => del(blob.url))
      await Promise.all(deletePromises)
      
      console.log(`🗑️ Deleted ${blobs.length} files for document ${documentId}`)
    } catch (error) {
      console.error('Failed to delete document files:', error)
      // Don't throw - deletion is not critical
    }
  }

  // Get download URL for a stored file
  static async getDownloadUrl(pathname: string): Promise<string | null> {
    try {
      const headResult = await head(pathname)
      return headResult.url
    } catch (error) {
      console.error('Failed to get download URL:', error)
      return null
    }
  }

  // Generate thumbnail image using Canvas API
  private static async generateThumbnailImage(
    results: TranslationResult[],
    filename: string,
    targetLanguage: string
  ): Promise<Blob> {
    // Create a canvas for thumbnail generation
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    
    // Set thumbnail dimensions (3:4 aspect ratio, like a document)
    const width = 300
    const height = 400
    canvas.width = width
    canvas.height = height
    
    // Background
    ctx.fillStyle = '#f8f5f0'
    ctx.fillRect(0, 0, width, height)
    
    // Header section
    ctx.fillStyle = '#5d4037'
    ctx.fillRect(0, 0, width, 60)
    
    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px Arial'
    ctx.textAlign = 'center'
    const truncatedTitle = filename.length > 25 ? filename.substring(0, 25) + '...' : filename
    ctx.fillText(truncatedTitle, width / 2, 25)
    
    // Language
    ctx.font = '12px Arial'
    ctx.fillText(`→ ${targetLanguage}`, width / 2, 45)
    
    // Content preview
    if (results.length > 0) {
      const firstPage = results[0]
      
      // Original text section
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(10, 80, width - 20, 60)
      ctx.strokeStyle = '#8d6e63'
      ctx.lineWidth = 2
      ctx.strokeRect(10, 80, width - 20, 60)
      
      ctx.fillStyle = '#8d6e63'
      ctx.font = 'bold 11px Arial'
      ctx.textAlign = 'left'
      ctx.fillText('Original', 15, 95)
      
      ctx.fillStyle = '#5d4037'
      ctx.font = '9px Arial'
      const originalText = firstPage.original_text?.substring(0, 120) || 'No text extracted'
      this.wrapText(ctx, originalText, 15, 110, width - 30, 12)
      
      // Translation section
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(10, 160, width - 20, 60)
      ctx.strokeStyle = '#4e342e'
      ctx.lineWidth = 2
      ctx.strokeRect(10, 160, width - 20, 60)
      
      ctx.fillStyle = '#4e342e'
      ctx.font = 'bold 11px Arial'
      ctx.fillText('Translation', 15, 175)
      
      ctx.fillStyle = '#5d4037'
      ctx.font = '9px Arial'
      const translatedText = firstPage.translated_text?.substring(0, 120) || 'No translation available'
      this.wrapText(ctx, translatedText, 15, 190, width - 30, 12)
    }
    
    // Page info
    ctx.fillStyle = '#8d6e63'
    ctx.font = '10px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${results.length} pages`, width / 2, height - 20)
    
    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!)
      }, 'image/png', 0.8)
    })
  }
  
  // Helper function to wrap text in canvas
  private static wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): void {
    const words = text.split(' ')
    let line = ''
    let currentY = y
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' '
      const metrics = ctx.measureText(testLine)
      const testWidth = metrics.width
      
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, currentY)
        line = words[n] + ' '
        currentY += lineHeight
        
        // Stop if we've used too much vertical space
        if (currentY > y + lineHeight * 3) break
      } else {
        line = testLine
      }
    }
    ctx.fillText(line, x, currentY)
  }

  // Generate HTML content
  private static generateHTMLContent(
    results: TranslationResult[], 
    filename: string, 
    targetLanguage: string
  ): string {
    const htmlPages = results
      .sort((a, b) => a.page_number - b.page_number)
      .map(result => `
        <div class="page" data-page="${result.page_number}">
          <div class="page-header">
            <h2>Page ${result.page_number}</h2>
          </div>
          <div class="page-content">
            <div class="original-text">
              <h3>Original Text</h3>
              <div class="text-content">${result.original_text?.replace(/\n/g, '<br>') || 'No text extracted'}</div>
            </div>
            <div class="translated-text">
              <h3>Translation (${targetLanguage})</h3>
              <div class="text-content">${result.translated_text?.replace(/\n/g, '<br>') || 'No translation available'}</div>
            </div>
            ${result.notes ? `
              <div class="notes">
                <h4>Translation Notes</h4>
                <div class="notes-content">${result.notes.replace(/\n/g, '<br>')}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Georgia', serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f8f5f0;
            color: #5d4037;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: white;
            border-radius: 8px;
            border: 1px solid #d4b896;
        }
        .page {
            background: white;
            margin-bottom: 30px;
            border-radius: 8px;
            border: 1px solid #d4b896;
            overflow: hidden;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-header {
            background: #f0e6d6;
            padding: 15px 20px;
            border-bottom: 1px solid #d4b896;
        }
        .page-header h2 {
            margin: 0;
            color: #4e342e;
        }
        .page-content {
            padding: 20px;
        }
        .original-text, .translated-text {
            margin-bottom: 25px;
        }
        .original-text h3 {
            color: #8d6e63;
            border-bottom: 2px solid #8d6e63;
            padding-bottom: 5px;
        }
        .translated-text h3 {
            color: #4e342e;
            border-bottom: 2px solid #4e342e;
            padding-bottom: 5px;
        }
        .text-content {
            background: #fafafa;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #d4b896;
            margin-top: 10px;
        }
        .notes {
            background: #fff8e1;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #ff9800;
            margin-top: 20px;
        }
        .notes h4 {
            margin-top: 0;
            color: #e65100;
        }
        @media print {
            body { background: white; }
            .page { page-break-inside: avoid; margin-bottom: 0; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>PDF Translation</h1>
        <p><strong>Original File:</strong> ${filename}</p>
        <p><strong>Target Language:</strong> ${targetLanguage}</p>
        <p><strong>Total Pages:</strong> ${results.length}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    ${htmlPages}
    
    <div style="text-align: center; margin-top: 40px; color: #8d6e63; font-style: italic;">
        Generated by AI PDF Translation Service
    </div>
</body>
</html>`
  }
}

export default FileStorageManager 