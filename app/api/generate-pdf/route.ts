import { NextRequest, NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import { generateSideBySideHTML } from '../../utils/htmlGenerators'

export async function POST(request: NextRequest) {
  try {
    const { results, filename } = await request.json()

    if (!results || !results.length) {
      return NextResponse.json(
        { error: 'No translation results provided' },
        { status: 400 }
      )
    }

    console.log(`📄 Generating PDF for ${filename} with ${results.length} pages`)

    // Create new PDF document
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
    doc.text(`Side-by-Side Translation: ${filename}`, margin, margin + 10)

    let yPosition = margin + 30

    // Process each page result
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      
      // Check if we need a new page
      if (yPosition > pageHeight - 50) {
        doc.addPage()
        yPosition = margin + 10
      }

      // Page number header
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Page ${result.page_number}`, margin, yPosition)
      yPosition += 15

      // Original section
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('Original:', margin, yPosition)
      yPosition += 8

      // Add image if available (simplified approach)
      if (result.page_image && result.page_image.length > 0) {
        try {
          // Add a note about the image
          doc.setFont('helvetica', 'normal')
          doc.text('[Original page image - see HTML version for full image]', margin + 5, yPosition)
          yPosition += 10
        } catch (error) {
          console.log('Could not add image to PDF:', error)
          doc.setFont('helvetica', 'italic')
          doc.text('[Image available in HTML version]', margin + 5, yPosition)
          yPosition += 10
        }
      } else {
        doc.setFont('helvetica', 'italic')
        doc.text('[No image available]', margin + 5, yPosition)
        yPosition += 10
      }

      yPosition += 5

      // Translation section
      doc.setFont('helvetica', 'bold')
      doc.text('Translation:', margin, yPosition)
      yPosition += 8

      // Add translation text (with word wrapping)
      doc.setFont('helvetica', 'normal')
      const translationLines = doc.splitTextToSize(result.translated_text, contentWidth - 10)
      doc.text(translationLines, margin + 5, yPosition)
      yPosition += translationLines.length * 5 + 15

      // Add separator line
      if (i < results.length - 1) {
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, yPosition, pageWidth - margin, yPosition)
        yPosition += 10
      }
    }

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    console.log(`✅ PDF generated successfully: ${pdfBuffer.length} bytes`)

    // Return PDF as response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename.replace('.pdf', '')}_translated.pdf"`
      }
    })

  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    )
  }
} 