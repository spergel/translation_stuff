import { TranslationResult } from '../types/translation'

export function formatTranslationText(text: string): string {
  // Format dialogue and stage directions
  let formatted = text
    .replace(/([A-Za-z]+)(\s*\([^)]+\))?\n/g, '<span class="character-name">$1$2</span>\n')
    .replace(/\(([^)]+)\)/g, '<span class="stage-direction">($1)</span>')
  
  return formatted
}

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
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="comparison">
            <div class="original">
                <div class="section-title">Original Content</div>
                <div class="original-content">
                    ${page.original_text ? `
                        <div class="original-text">${formatTranslationText(page.original_text)}</div>
                    ` : ''}
                    ${page.page_image && page.page_image.length > 0 ? `
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Image" 
                             class="page-image" />
                    ` : `
                        <div class="placeholder">
                            Original Page ${page.page_number}
                            <br><small>(No image available)</small>
                        </div>
                    `}
                </div>
            </div>
            <div class="translation-container">
                <div class="section-title">Translation</div>
                <div class="translation">${formatTranslationText(page.translated_text)}</div>
                ${page.notes ? `<div class="notes">${page.notes}</div>` : ''}
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateOriginalNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original Text & Translation: ${filename}</title>
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
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-text, .translation-text {
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            white-space: pre-line;
            border-radius: 4px;
            min-height: 100px;
        }
        .translation-text {
            background-color: #f0f8ff;
            border-left: 4px solid #4CAF50;
        }
        .no-text-message {
            background-color: #fff8e1;
            padding: 20px;
            border-left: 4px solid #FFC107;
            border-radius: 4px;
            color: #8D6E63;
            font-style: italic;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>Original Text & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Text</div>
                ${page.original_text && page.original_text.trim() && 
                  !page.original_text.includes('This page contains only an image') &&
                  !page.original_text.includes('Could not extract text') ? `
                    <div class="original-text">${page.original_text}</div>
                ` : `
                    <div class="no-text-message">
                        📄 This page appears to be image-only or the text could not be extracted.<br>
                        <small>The page may contain graphics, charts, or handwritten content.</small>
                    </div>
                `}
            </div>
            <div class="translation-column">
                <div class="column-header">Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateOriginalNextToTranscriptionHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original Text & Transcription: ${filename}</title>
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
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .transcription-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-text, .transcription-text {
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            white-space: pre-line;
            border-radius: 4px;
            min-height: 100px;
        }
        .transcription-text {
            background-color: #f0f8ff;
            border-left: 4px solid #2196F3;
        }
        .no-text-message {
            background-color: #fff8e1;
            padding: 20px;
            border-left: 4px solid #FFC107;
            border-radius: 4px;
            color: #8D6E63;
            font-style: italic;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>Original Text & Transcription: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Text</div>
                ${page.original_text && page.original_text.trim() && 
                  !page.original_text.includes('This page contains only an image') &&
                  !page.original_text.includes('Could not extract text') ? `
                    <div class="original-text">${page.original_text}</div>
                ` : `
                    <div class="no-text-message">
                        📄 This page appears to be image-only or the text could not be extracted.<br>
                        <small>The page may contain graphics, charts, or handwritten content.</small>
                    </div>
                `}
            </div>
            <div class="transcription-column">
                <div class="column-header">Transcription</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateOriginalTranscriptionTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original, Transcription & Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.6;
            max-width: 1600px;
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
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 20px;
        }
        .original-column, .transcription-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
            font-size: 0.9em;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 12px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 12px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .transcription-text {
            background-color: #fff8e1;
            padding: 12px;
            border-left: 4px solid #FF9800;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 12px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            font-size: 0.9em;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Complete Document Analysis: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="transcription-column">
                <div class="column-header">Transcribed Text</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateTranscriptionNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcription & Translation: ${filename}</title>
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
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .transcription-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .transcription-text {
            background-color: #fff8e1;
            padding: 15px;
            border-left: 4px solid #FF9800;
            white-space: pre-line;
            font-family: 'Courier New', monospace;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 15px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Transcription & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="transcription-column">
                <div class="column-header">Transcribed Text</div>
                <div class="transcription-text">${page.original_text || 'Transcription not available'}</div>
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateTranslationOnlyHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Translation: ${filename}</title>
    <style>
        body {
            font-family: 'Bookerly', 'Georgia', serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #fefefe;
            color: #2c3e50;
        }
        h1 {
            text-align: center;
            color: #2c3e50;
            font-size: 2.2em;
            margin-bottom: 40px;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
        }
        .page {
            margin-bottom: 40px;
            padding: 30px;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            border-left: 5px solid #3498db;
        }
        .page-number {
            color: #7f8c8d;
            font-size: 0.9em;
            font-weight: bold;
            margin-bottom: 20px;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .translation {
            font-size: 1.1em;
            line-height: 1.8;
            text-align: justify;
            color: #2c3e50;
        }
        .translation p {
            margin-bottom: 1.2em;
        }
    </style>
</head>
<body>
    <h1>English Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="translation">${formatTranslationText(page.translated_text)}</div>
    </div>
    `).join('')}
</body>
</html>`
}

export function generateOriginalImageNextToTranslationHTML(results: TranslationResult[], filename: string): string {
  const sortedResults = [...results].sort((a, b) => a.page_number - b.page_number)
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Original Image & Translation: ${filename}</title>
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
            font-size: 1.1em;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 10px;
        }
        .content-row {
            display: flex;
            gap: 30px;
        }
        .original-column, .translation-column {
            flex: 1;
        }
        .column-header {
            font-weight: bold;
            color: #5D4037;
            border-bottom: 2px solid #8D6E63;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .original-image {
            text-align: center;
            background-color: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #8D6E63;
            border-radius: 4px;
        }
        .original-image img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .no-image-placeholder {
            background-color: #f9f9f9;
            padding: 40px 15px;
            border-left: 4px solid #8D6E63;
            text-align: center;
            color: #666;
            font-style: italic;
            border-radius: 4px;
        }
        .translation-text {
            background-color: #f0f8ff;
            padding: 15px;
            border-left: 4px solid #4CAF50;
            white-space: pre-line;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Original Image & Translation: ${filename}</h1>
    ${sortedResults.map(page => `
    <div class="page">
        <div class="page-number">Page ${page.page_number}</div>
        <div class="content-row">
            <div class="original-column">
                <div class="column-header">Original Page Image</div>
                ${page.page_image && page.page_image.length > 0 ? `
                    <div class="original-image">
                        <img src="${page.page_image.startsWith('data:') ? page.page_image : `data:image/png;base64,${page.page_image}`}" 
                             alt="Page ${page.page_number} Original" />
                    </div>
                ` : `
                    <div class="no-image-placeholder">
                        Original Page ${page.page_number}<br>
                        <small>(Image not available)</small>
                    </div>
                `}
            </div>
            <div class="translation-column">
                <div class="column-header">English Translation</div>
                <div class="translation-text">${page.translated_text}</div>
            </div>
        </div>
    </div>
    `).join('')}
</body>
</html>`
} 