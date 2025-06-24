import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';
import { generateHTML, generateTranslationOnlyHTML } from '../../utils/htmlGenerators';
import { TranslationResult } from '../../types/translation';

// Fallback PDF generation using jsPDF and html2canvas
async function generatePDFFallback(html: string, filename: string): Promise<Buffer> {
  // This is a placeholder for the fallback method
  // In a real implementation, you would use jsPDF and html2canvas
  // For now, we'll throw an error to indicate the fallback is needed
  throw new Error('Puppeteer failed, fallback method not implemented');
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

    let pdf: Buffer | Uint8Array;

    try {
      // Try puppeteer first
      const browser = await puppeteer.launch({ 
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
      });
      
      const page = await browser.newPage();
      
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 800 });
      
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      pdf = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });

      await browser.close();
    } catch (puppeteerError) {
      console.error('Puppeteer failed, trying fallback method:', puppeteerError);
      
      // Try fallback method
      try {
        pdf = await generatePDFFallback(html, filename);
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
        const puppeteerMsg = puppeteerError instanceof Error ? puppeteerError.message : 'Unknown puppeteer error';
        const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error';
        throw new Error(`PDF generation failed: ${puppeteerMsg}. Fallback also failed: ${fallbackMsg}`);
      }
    }

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    
    // Return a more detailed error for debugging
    return NextResponse.json({ 
      error: 'Failed to generate PDF',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 