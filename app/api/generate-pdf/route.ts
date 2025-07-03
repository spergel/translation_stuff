import { NextRequest, NextResponse } from 'next/server';
import { generateHTML, generateTranslationOnlyHTML } from '../../utils/htmlGenerators';
import { TranslationResult } from '../../types/translation';

// Simple HTML-to-PDF fallback that works without Puppeteer
async function generatePDFFallback(html: string, filename: string): Promise<Buffer> {
  // Create a minimal PDF-like response using basic HTML structure
  // This is a simple fallback - in production you might want to use a service like Documint or PDFShift
  const simplePdfHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${filename}</title>
    <style>
        @page {
            margin: 2cm;
            size: A4;
        }
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 100%;
        }
        .page-break {
            page-break-before: always;
        }
        h1, h2, h3 {
            color: #2c5aa0;
        }
        .translation-page {
            margin-bottom: 2em;
            padding: 1em;
            border-left: 3px solid #2c5aa0;
        }
        .page-number {
            font-weight: bold;
            color: #666;
            margin-bottom: 1em;
        }
        .translation-content {
            white-space: pre-wrap;
        }
        @media print {
            .page-break {
                page-break-before: always;
            }
        }
    </style>
</head>
<body>
    ${html}
    <script>
        // Auto-print when loaded (for manual PDF generation)
        window.addEventListener('load', function() {
            if (window.location.search.includes('print=true')) {
                setTimeout(() => window.print(), 100);
            }
        });
    </script>
</body>
</html>`;

  // Return the HTML as a "PDF" - browsers can print this to PDF
  return Buffer.from(simplePdfHtml, 'utf-8');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { results, filename, translationOnly } = body as { 
      results: TranslationResult[], 
      filename: string,
      translationOnly?: boolean
    };

    if (!results || !filename) {
      return NextResponse.json({ error: 'Missing results or filename' }, { status: 400 });
    }

    const html = translationOnly 
      ? generateTranslationOnlyHTML(results, filename)
      : generateHTML(results, filename);

    // Use the fallback method (which works everywhere)
    const pdfBuffer = await generatePDFFallback(html, filename);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.html"`,
        'X-Print-Ready': 'true', // Hint for frontend to offer print-to-PDF
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    return NextResponse.json({ 
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 