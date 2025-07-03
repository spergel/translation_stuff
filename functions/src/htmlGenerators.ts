import { TranslationResult } from '../../app/types/translation'

export function generateHTML(results: TranslationResult[], filename: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${filename} - Original vs Translation</title>
        <style>
          /* CSS Variables matching your site */
          :root {
            --color-primary-50: #f8f5f0;
            --color-primary-100: #8D6E63;
            --color-primary-200: #6D4C41;
            --color-primary-300: #5D4037;
            --color-primary-400: #4E342E;
            --color-white: #ffffff;
            --color-original-bg: #fff8e1;
            --color-translation-bg: #f0f8ff;
            --color-warning: #FF9800;
            --color-success: #4CAF50;
            --font-primary: 'Bookerly', 'Georgia', serif;
            --font-secondary: 'Inter', system-ui, sans-serif;
            --space-4: 1rem;
            --space-6: 1.5rem;
            --space-8: 2rem;
          }

          * {
            box-sizing: border-box;
          }

          body { 
            font-family: var(--font-primary);
            line-height: 1.6;
            color: var(--color-primary-300);
            background-color: var(--color-primary-50);
            margin: 0;
            padding: var(--space-8);
            -webkit-font-smoothing: antialiased;
          }

          .container {
            max-width: 1400px;
            margin: 0 auto;
          }

          .header {
            text-align: center;
            margin-bottom: var(--space-8);
          }

          .header h1 {
            font-family: var(--font-primary);
            font-size: 2.25rem;
            font-weight: 700;
            color: var(--color-primary-300);
            margin: 0 0 var(--space-4) 0;
            line-height: 1.25;
          }

          .subtitle {
            font-family: var(--font-secondary);
            color: var(--color-primary-200);
            font-size: 1.125rem;
            margin: 0;
          }

          .page {
            background: var(--color-white);
            border: 1px solid #ddd;
            border-radius: 8px;
            margin-bottom: var(--space-8);
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            overflow: hidden;
            transition: box-shadow 0.2s ease;
          }

          .page:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }

          .page-header {
            background: var(--color-primary-300);
            color: var(--color-white);
            padding: var(--space-4) var(--space-6);
            font-family: var(--font-primary);
            font-size: 1.25rem;
            font-weight: 700;
            border-bottom: 2px solid var(--color-primary-100);
          }

          .comparison-layout {
            display: flex;
            gap: 0;
            min-height: 400px;
          }

          .original-content, .translated-content {
            flex: 1;
            padding: var(--space-6);
            overflow-wrap: break-word;
          }

          .original-content {
            background: var(--color-original-bg);
            border-left: 4px solid var(--color-warning);
            border-right: 1px solid #e5e7eb;
          }

          .translated-content {
            background: var(--color-translation-bg);
            border-left: 4px solid var(--color-success);
          }

          .section-title {
            font-family: var(--font-secondary);
            font-weight: 600;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: var(--space-4);
            padding-bottom: var(--space-2);
            border-bottom: 2px solid var(--color-primary-100);
          }

          .original-title { 
            color: var(--color-warning);
          }

          .translation-title { 
            color: var(--color-success);
          }

          .text-content {
            font-family: var(--font-primary);
            line-height: 1.7;
            font-size: 1rem;
            white-space: pre-wrap;
            color: var(--color-primary-300);
          }

          .page-number {
            display: inline-block;
            background: var(--color-primary-100);
            color: var(--color-white);
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: var(--font-secondary);
          }

          @media (max-width: 768px) {
            body {
              padding: var(--space-4);
            }

            .header h1 {
              font-size: 1.875rem;
            }

            .comparison-layout {
              flex-direction: column;
              gap: var(--space-4);
            }

            .original-content {
              border-right: none;
              border-bottom: 1px solid #e5e7eb;
            }

            .original-content, .translated-content {
              padding: var(--space-4);
            }
          }

          .watermark {
            text-align: center;
            margin-top: var(--space-8);
            padding-top: var(--space-4);
            border-top: 1px solid #ddd;
            font-family: var(--font-secondary);
            color: var(--color-primary-200);
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${filename}</h1>
            <p class="subtitle">Original Text vs Translation</p>
          </div>

          ${results.map((result) => `
            <div class="page">
              <div class="page-header">
                <span class="page-number">Page ${result.page_number}</span>
              </div>
              <div class="comparison-layout">
                <div class="original-content">
                  <div class="section-title original-title">📄 Original Text</div>
                  <div class="text-content">${result.original_text || '[No text extracted from this page]'}</div>
                </div>
                <div class="translated-content">
                  <div class="section-title translation-title">🌍 Translation</div>
                  <div class="text-content">${result.translation || '[No translation available for this page]'}</div>
                </div>
              </div>
            </div>
          `).join('')}

          <div class="watermark">
            Generated by your Translation App • Created ${new Date().toLocaleDateString()}
          </div>
        </div>
      </body>
    </html>
  `
}

export function generateTranslationOnlyHTML(results: TranslationResult[], filename: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${filename} - Translation Only</title>
        <style>
          /* CSS Variables matching your site */
          :root {
            --color-primary-50: #f8f5f0;
            --color-primary-100: #8D6E63;
            --color-primary-200: #6D4C41;
            --color-primary-300: #5D4037;
            --color-white: #ffffff;
            --color-success: #4CAF50;
            --font-primary: 'Bookerly', 'Georgia', serif;
            --font-secondary: 'Inter', system-ui, sans-serif;
            --space-4: 1rem;
            --space-6: 1.5rem;
            --space-8: 2rem;
          }

          * {
            box-sizing: border-box;
          }

          body { 
            font-family: var(--font-primary);
            line-height: 1.7;
            color: var(--color-primary-300);
            background-color: var(--color-primary-50);
            margin: 0;
            padding: var(--space-8);
            -webkit-font-smoothing: antialiased;
          }

          .container {
            max-width: 800px;
            margin: 0 auto;
          }

          .header {
            text-align: center;
            margin-bottom: var(--space-8);
            padding-bottom: var(--space-6);
            border-bottom: 2px solid var(--color-primary-100);
          }

          .header h1 {
            font-family: var(--font-primary);
            font-size: 2.25rem;
            font-weight: 700;
            color: var(--color-primary-300);
            margin: 0 0 var(--space-4) 0;
            line-height: 1.25;
          }

          .subtitle {
            font-family: var(--font-secondary);
            color: var(--color-primary-200);
            font-size: 1.125rem;
            margin: 0;
          }

          .page {
            background: var(--color-white);
            border: 1px solid #ddd;
            border-radius: 8px;
            margin-bottom: var(--space-8);
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            overflow: hidden;
            transition: box-shadow 0.2s ease;
          }

          .page:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }

          .page-header {
            background: var(--color-success);
            color: var(--color-white);
            padding: var(--space-4) var(--space-6);
            font-family: var(--font-primary);
            font-size: 1.25rem;
            font-weight: 700;
          }

          .page-content {
            padding: var(--space-6);
          }

          .translation-text {
            font-family: var(--font-primary);
            line-height: 1.7;
            font-size: 1.125rem;
            white-space: pre-wrap;
            color: var(--color-primary-300);
          }

          .page-number {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            color: var(--color-white);
            padding: 0.25rem 0.75rem;
            border-radius: 9999px;
            font-size: 0.875rem;
            font-weight: 600;
            font-family: var(--font-secondary);
          }

          @media (max-width: 768px) {
            body {
              padding: var(--space-4);
            }

            .header h1 {
              font-size: 1.875rem;
            }

            .page-content {
              padding: var(--space-4);
            }

            .translation-text {
              font-size: 1rem;
            }
          }

          .watermark {
            text-align: center;
            margin-top: var(--space-8);
            padding-top: var(--space-4);
            border-top: 1px solid #ddd;
            font-family: var(--font-secondary);
            color: var(--color-primary-200);
            font-size: 0.875rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${filename}</h1>
            <p class="subtitle">🌍 Translation Only</p>
          </div>

          ${results.map((result) => `
            <div class="page">
              <div class="page-header">
                <span class="page-number">Page ${result.page_number}</span>
              </div>
              <div class="page-content">
                <div class="translation-text">${result.translation || '[No translation available for this page]'}</div>
              </div>
            </div>
          `).join('')}

          <div class="watermark">
            Generated by your Translation App • Created ${new Date().toLocaleDateString()}
          </div>
        </div>
      </body>
    </html>
  `
} 