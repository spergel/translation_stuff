import { TranslationResult } from '../types/translation'

export function generateHTML(results: TranslationResult[], filename: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename} - Translation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .page { margin-bottom: 40px; }
          .original { margin-bottom: 20px; }
          .translation { color: #666; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${results.map((result, index) => `
          <div class="page">
            <h2>Page ${index + 1}</h2>
            <div class="original">
              ${result.page_image ? `<img src="${result.page_image}" alt="Original page ${index + 1}" />` : ''}
            </div>
            <div class="translation">
              ${result.translation}
            </div>
          </div>
        `).join('')}
      </body>
    </html>
  `
}

export function generateTranslationOnlyHTML(results: TranslationResult[], filename: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename} - Translation Only</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .page { margin-bottom: 40px; }
          .translation { line-height: 1.6; }
        </style>
      </head>
      <body>
        ${results.map((result, index) => `
          <div class="page">
            <h2>Page ${index + 1}</h2>
            <div class="translation">
              ${result.translation}
            </div>
          </div>
        `).join('')}
      </body>
    </html>
  `
} 