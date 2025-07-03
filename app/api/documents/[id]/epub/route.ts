import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/lib/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/app/lib/firebase'
import { generateEpubContent, generateEpubPackage } from '@/app/utils/epubGeneration'
import { TranslationResult } from '@/app/types/translation'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const docRef = doc(db, 'documents', documentId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = docSnap.data()
    
    // Check if user owns this document
    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if document is completed and has results
    if (document.status !== 'completed' || !document.results) {
      return NextResponse.json({ 
        error: 'Document must be completed and have translation results', 
        status: document.status 
      }, { status: 400 })
    }

    console.log('📚 Generating EPUB for document:', documentId)

    const results: TranslationResult[] = document.results
    const bookTitle = document.title || document.originalFilename?.replace(/\.pdf$/i, '') || 'Translated Document'
    
    // Generate EPUB content with chapters
    const { chapters, metadata } = await generateEpubContent({
      results,
      bookTitle,
      targetLanguage: document.targetLanguage || 'english',
      originalFilename: document.originalFilename || 'document.pdf',
      userId: session.user.id
    })

    // Generate EPUB package
    const epubPackage = generateEpubPackage(chapters, metadata)

    // Create a simple EPUB structure (we'll return the content as JSON for now)
    // In a full implementation, you'd create a proper ZIP file
    const epubContent = {
      metadata,
      chapters: chapters.map(ch => ({
        title: ch.title,
        startPage: ch.startPage,
        endPage: ch.endPage,
        content: ch.content
      })),
      package: {
        ...epubPackage,
        // For now, return as JSON. In production, you'd create an actual EPUB ZIP file
        totalFiles: 3 + epubPackage.chapterFiles.length, // mimetype + container + styles + chapters
      }
    }

    // For now, return EPUB content as HTML (simplified)
    const htmlContent = generateSimpleEpubHTML(chapters, metadata)

    return new NextResponse(htmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${bookTitle}.html"`,
        'X-Chapter-Count': chapters.length.toString(),
        'X-EPUB-Ready': 'true',
      },
    })

  } catch (error) {
    console.error('❌ Error generating EPUB:', error)
    return NextResponse.json({ 
      error: 'EPUB generation failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Generate a simple HTML version of the EPUB content
function generateSimpleEpubHTML(chapters: any[], metadata: any): string {
  const tableOfContents = chapters.map((chapter, index) => 
    `<li><a href="#chapter-${index + 1}">${chapter.title}</a> <span class="page-range">(pages ${chapter.startPage}-${chapter.endPage})</span></li>`
  ).join('\n        ')

  const chapterContent = chapters.map((chapter, index) => `
    <div class="chapter" id="chapter-${index + 1}">
      <h1>${chapter.title}</h1>
      <div class="chapter-meta">Pages ${chapter.startPage}-${chapter.endPage}</div>
      ${chapter.content}
    </div>
    <div class="chapter-break"></div>
  `).join('\n')

  return `<!DOCTYPE html>
<html lang="${metadata.language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title}</title>
    <style>
        body {
            font-family: Georgia, serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2em;
            color: #333;
            background: #fff;
        }
        
        .book-header {
            text-align: center;
            margin-bottom: 3em;
            padding-bottom: 2em;
            border-bottom: 3px solid #2c5aa0;
        }
        
        .book-title {
            font-size: 2.5em;
            color: #2c5aa0;
            margin-bottom: 0.5em;
            font-weight: bold;
        }
        
        .book-meta {
            color: #666;
            font-style: italic;
        }
        
        .toc {
            background: #f8f9fa;
            padding: 2em;
            margin-bottom: 3em;
            border-radius: 8px;
            border-left: 4px solid #2c5aa0;
        }
        
        .toc h2 {
            color: #2c5aa0;
            margin-top: 0;
        }
        
        .toc ul {
            list-style: none;
            padding: 0;
        }
        
        .toc li {
            margin-bottom: 0.5em;
            padding: 0.5em;
            background: white;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .toc a {
            color: #2c5aa0;
            text-decoration: none;
            font-weight: 500;
        }
        
        .toc a:hover {
            text-decoration: underline;
        }
        
        .page-range {
            color: #999;
            font-size: 0.9em;
        }
        
        .chapter {
            margin-bottom: 4em;
        }
        
        .chapter h1 {
            color: #2c5aa0;
            border-bottom: 2px solid #2c5aa0;
            padding-bottom: 0.5em;
            margin-bottom: 1em;
        }
        
        .chapter-meta {
            color: #666;
            font-style: italic;
            margin-bottom: 2em;
            font-size: 0.9em;
        }
        
        .chapter-break {
            page-break-after: always;
            height: 2em;
            border-bottom: 1px dashed #ddd;
            margin: 3em 0;
        }
        
        .page {
            margin-bottom: 2em;
            padding-bottom: 1.5em;
            border-bottom: 1px solid #eee;
        }
        
        .page h3 {
            color: #666;
            font-size: 1.1em;
            margin-bottom: 1em;
        }
        
        .translation {
            margin-bottom: 1.5em;
            line-height: 1.7;
        }
        
        .original {
            background: #f8f9fa;
            padding: 1em;
            border-left: 3px solid #ddd;
            font-size: 0.9em;
            color: #666;
            border-radius: 0 4px 4px 0;
        }
        
        .original h4 {
            margin-top: 0;
            color: #999;
        }
        
        @media print {
            .chapter-break {
                page-break-after: always;
            }
            
            body {
                padding: 1em;
            }
            
            .toc {
                page-break-after: always;
            }
        }
        
        @media (max-width: 600px) {
            body {
                padding: 1em;
            }
            
            .book-title {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="book-header">
        <h1 class="book-title">${metadata.title}</h1>
        <div class="book-meta">
            Translated with AI | ${metadata.pages} pages | ${metadata.chapters} chapters
            <br>Generated on ${metadata.published}
        </div>
    </div>
    
    <div class="toc">
        <h2>Table of Contents</h2>
        <ul>
        ${tableOfContents}
        </ul>
    </div>
    
    ${chapterContent}
    
    <div style="text-align: center; margin-top: 3em; padding-top: 2em; border-top: 1px solid #ddd; color: #999; font-size: 0.9em;">
        Generated by AI PDF Translator
    </div>
</body>
</html>`
} 