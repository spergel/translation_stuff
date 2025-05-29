import { TranslationResult, TranslationJob } from '../types/translation'

// HTML generation functions
export function generateHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Translated: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: right;
            color: #8D6E63;
            font-size: 0.9em;
            margin-bottom: 10px;
        }
        .translation {
            white-space: pre-line;
            font-size: 1.1em;
        }
        .notes {
            font-style: italic;
            color: #707070;
            border-top: 1px dashed #ccc;
            margin-top: 15px;
            padding-top: 10px;
        }
        .character-name {
            font-weight: bold;
            color: #5D4037;
        }
        .stage-direction {
            font-style: italic;
            color: #6D4C41;
        }
    </style>
</head>
<body>
    <h1>Translated: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="translation">${formatTranslationText(page.translated_text)}</div>
        ${page.notes ? `<div class="notes">${page.notes}</div>` : ''}
    </div>
    `).join('')}
</body>
</html>`
}

export function generateSideBySideHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  // DEBUG: Log each page's image status during HTML generation
  console.log(`🖼️ DEBUG: Generating HTML for ${filename} with ${sortedResults.length} pages:`)
  sortedResults.forEach(page => {
    console.log(`   Page ${page.page_number}:`)
    console.log(`     - has page_image: ${!!page.page_image}`)
    console.log(`     - page_image type: ${typeof page.page_image}`)
    console.log(`     - page_image length: ${page.page_image ? page.page_image.length : 'N/A'}`)
    console.log(`     - condition (page.page_image && page.page_image.length > 0): ${page.page_image && page.page_image.length > 0}`)
    console.log(`     - starts with data: ${page.page_image ? page.page_image.startsWith('data:') : 'N/A'}`)
    
    // DEBUG: Check for potential base64 corruption
    if (page.page_image && page.page_image.length > 0) {
      const base64Part = page.page_image.split(',')[1]
      console.log(`     - base64 part length: ${base64Part ? base64Part.length : 'N/A'}`)
      console.log(`     - base64 sample (first 100 chars): ${base64Part ? base64Part.substring(0, 100) : 'N/A'}`)
      console.log(`     - base64 sample (last 50 chars): ${base64Part ? base64Part.slice(-50) : 'N/A'}`)
      
      // Check for invalid characters
      const validBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(base64Part || '')
      console.log(`     - valid base64 format: ${validBase64}`)
      
      // DEBUG: Try to actually load the image to see if it's valid
      const testImg = new Image()
      testImg.onload = () => {
        console.log(`     ✅ Page ${page.page_number} image loaded successfully: ${testImg.width}x${testImg.height}`)
      }
      testImg.onerror = (error) => {
        console.error(`     ❌ Page ${page.page_number} image failed to load:`, error)
      }
      testImg.src = page.page_image
    }
  })
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Side-by-Side: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f5f0;
            color: #333;
        }
        h1 {
            text-align: center;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        .page {
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .page-number {
            text-align: center;
            color: #8D6E63;
            font-size: 1.2em;
            margin-bottom: 15px;
            font-weight: bold;
        }
        .comparison {
            display: flex;
            gap: 20px;
            align-items: flex-start;
        }
        .original {
            flex: 1;
            border-right: 1px solid #ddd;
            padding-right: 20px;
        }
        .translation-container {
            flex: 1;
            padding-left: 20px;
        }
        .original-content {
            background-color: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .original-text {
            white-space: pre-line;
            font-size: 0.95em;
            color: #444;
            margin-bottom: 15px;
        }
        .page-image {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .translation {
            white-space: pre-line;
            font-size: 1.1em;
            background-color: #f0f8ff;
            border: 1px solid #b0d4ff;
            border-radius: 5px;
            padding: 15px;
        }
        .notes {
            font-style: italic;
            color: #707070;
            border-top: 1px dashed #ccc;
            margin-top: 15px;
            padding-top: 10px;
        }
        .character-name {
            font-weight: bold;
            color: #5D4037;
        }
        .stage-direction {
            font-style: italic;
            color: #6D4C41;
        }
        .placeholder {
            background-color: #f5f5f5;
            border: 2px dashed #ccc;
            padding: 40px;
            text-align: center;
            color: #666;
        }
        .section-title {
            font-weight: bold;
            color: #5D4037;
            margin-bottom: 10px;
            font-size: 1.1em;
        }
    </style>
</head>
<body>
    <h1>Side-by-Side Translation: ${filename}</h1>
    ${sortedResults.map(page => {
      // DEBUG: Log the exact HTML being generated for each page
      const imageHtml = page.page_image && page.page_image.length > 0 ? `
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Image" 
                             class="page-image" />
                    ` : `
                        <div class="placeholder">
                            Original Page ${page.page_number}
                            <br><small>(No image available)</small>
                        </div>
                    `
      
      console.log(`🔧 Page ${page.page_number} HTML snippet:`, imageHtml.substring(0, 200) + '...')
      
      return `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="comparison">
            <div class="original">
                <div class="section-title">Original Content</div>
                <div class="original-content">
                    ${page.original_text ? `
                        <div class="original-text">${formatTranslationText(page.original_text)}</div>
                    ` : ''}
                    ${imageHtml}
                </div>
            </div>
            <div class="translation-container">
                <div class="section-title">Translation</div>
                <div class="translation">${formatTranslationText(page.translated_text)}</div>
                ${page.notes ? `<div class="notes">${page.notes}</div>` : ''}
            </div>
        </div>
    </div>
    `}).join('')}
</body>
</html>`
}

function formatTranslationText(text: string): string {
  // Format dialogue and stage directions
  let formatted = text
    .replace(/([A-Za-z]+)(\s*\([^)]+\))?\n/g, '<span class="character-name">$1$2</span>\n')
    .replace(/\(([^)]+)\)/g, '<span class="stage-direction">($1)</span>')
  
  return formatted
}

// Download functions
export const downloadHTML = (job: TranslationJob) => {
  if (!job.results) return

  const html = generateHTML(job.results, job.filename)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${job.filename.replace('.pdf', '')}_translated.html`
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadPDF = async (job: TranslationJob) => {
  if (!job.results) return

  try {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        results: job.results,
        filename: job.filename
      })
    })

    if (!response.ok) throw new Error('PDF generation failed')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.filename.replace('.pdf', '')}_translated_structured.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    alert('Error generating PDF: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
}

export const viewSideBySide = (job: TranslationJob) => {
  if (!job.results) {
    console.error('No results available for side-by-side view')
    alert('No translation results available')
    return
  }
  
  console.log('Opening side-by-side view for:', job.filename, 'with', job.results.length, 'pages')
  
  try {
    // Open in new tab with side-by-side view
    const newWindow = window.open('', '_blank')
    if (newWindow) {
      const html = generateSideBySideHTML(job.results, job.filename)
      console.log('Generated HTML length:', html.length)
      newWindow.document.write(html)
      newWindow.document.close()
      console.log('Side-by-side view opened successfully')
    } else {
      console.error('Failed to open new window - popup blocked?')
      alert('Failed to open new window. Please check if popups are blocked.')
    }
  } catch (error) {
    console.error('Error opening side-by-side view:', error)
    alert('Error opening view: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
}

export const downloadAllAsPDF = async (jobs: TranslationJob[], format?: 'transcription_translation' | 'original_translation' | 'translation_only' | 'complete_analysis') => {
  // Get all completed jobs
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.results && job.results.length > 0
  )

  if (completedJobs.length === 0) {
    alert('No completed translations found to download.')
    return
  }

  if (completedJobs.length > 10) {
    const confirmed = confirm(
      `You are about to download ${completedJobs.length} PDF files in a ZIP. This may take a while. Continue?`
    )
    if (!confirmed) return
  }

  try {
    console.log(`📦 Downloading ${completedJobs.length} translations as ${format || 'individual'} PDF ZIP...`)
    
    // Use different endpoint based on whether format is specified
    const endpoint = format ? '/api/download-all-side-by-side-pdfs' : '/api/download-all-pdfs'
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobs: completedJobs.map(job => ({
          id: job.id,
          filename: job.filename,
          results: job.results,
          metadata: job.metadata
        })),
        ...(format && { format })
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate PDF ZIP file')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = format 
      ? `translations_${format}_pdfs_${new Date().toISOString().split('T')[0]}.zip`
      : `translations_${new Date().toISOString().split('T')[0]}.zip`
    a.click()
    URL.revokeObjectURL(url)

    console.log(`✅ Downloaded PDF ZIP with ${completedJobs.length} files${format ? ` in ${format} format` : ''}`)
    
  } catch (error) {
    console.error('Error downloading all PDFs:', error)
    alert('Error generating PDF ZIP file: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
}

export const downloadAllAsHTML = async (jobs: TranslationJob[], format: 'original_translation' | 'transcription_translation' | 'translation_only' | 'complete_analysis') => {
  // Get all completed jobs
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.results && job.results.length > 0
  )

  if (completedJobs.length === 0) {
    alert('No completed translations found to download.')
    return
  }

  if (completedJobs.length > 10) {
    const confirmed = confirm(
      `You are about to download ${completedJobs.length} HTML files in a ZIP. This may take a while. Continue?`
    )
    if (!confirmed) return
  }

  try {
    console.log(`📦 Downloading ${completedJobs.length} translations as ${format} HTML ZIP...`)
    
    const response = await fetch('/api/download-all-html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jobs: completedJobs.map(job => ({
          id: job.id,
          filename: job.filename,
          results: job.results,
          metadata: job.metadata
        })),
        format: format
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to generate HTML ZIP file')
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `translations_${format}_${new Date().toISOString().split('T')[0]}.zip`
    a.click()
    URL.revokeObjectURL(url)

    console.log(`✅ Downloaded HTML ZIP with ${completedJobs.length} files in ${format} format`)
    
  } catch (error) {
    console.error('Error downloading all HTML files:', error)
    alert('Error generating HTML ZIP file: ' + (error instanceof Error ? error.message : 'Unknown error'))
  }
} 