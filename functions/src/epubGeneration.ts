import { TranslationResult } from './chapterDetection';

interface EpubChapter {
  title: string;
  content: string;
  startPage: number;
  endPage: number;
}

export interface EpubGenerationOptions {
  results: TranslationResult[];
  bookTitle: string;
  targetLanguage: string;
  originalFilename: string;
  userId?: string;
}

// Generate EPUB content with chapters
export async function generateEpubContent(options: EpubGenerationOptions): Promise<{
  chapters: EpubChapter[];
  metadata: any;
}> {
  const { results, bookTitle, targetLanguage, originalFilename } = options;
  
  console.log('📚 Starting EPUB generation with', results.length, 'pages');
  
  // Extract chapters from results
  const chapterPages = results.filter(result => result.isChapterStart && result.chapterInfo);
  
  console.log('📋 Found', chapterPages.length, 'chapter starts');
  
  let chapters: EpubChapter[];
  
  if (chapterPages.length === 0) {
    // No chapters detected - create a single chapter with all content
    console.log('📄 No chapters detected, creating single chapter');
    chapters = [{
      title: bookTitle || 'Document',
      content: generateChapterHTML(results),
      startPage: 1,
      endPage: results.length
    }];
  } else {
    // Create chapters based on detected chapter starts
    chapters = [];
    
    for (let i = 0; i < chapterPages.length; i++) {
      const chapterStart = chapterPages[i];
      const nextChapterStart = chapterPages[i + 1];
      
      const startPage = chapterStart.page_number;
      const endPage = nextChapterStart ? nextChapterStart.page_number - 1 : results.length;
      
      // Get all pages for this chapter
      const chapterResults = results.filter(result => 
        result.page_number >= startPage && result.page_number <= endPage
      );
      
      const chapter: EpubChapter = {
        title: chapterStart.chapterInfo?.title || `Chapter ${i + 1}`,
        content: generateChapterHTML(chapterResults),
        startPage,
        endPage
      };
      
      chapters.push(chapter);
      console.log(`📖 Chapter ${i + 1}: "${chapter.title}" (pages ${startPage}-${endPage})`);
    }
  }
  
  const metadata = {
    title: bookTitle || originalFilename.replace(/\.pdf$/i, ''),
    author: 'AI Translation',
    language: targetLanguage,
    publisher: 'PDF Translator',
    published: new Date().toISOString().split('T')[0],
    description: `AI-translated document from ${originalFilename}`,
    pages: results.length,
    chapters: chapters.length
  };
  
  console.log('✅ EPUB content generated:', chapters.length, 'chapters');
  
  return { chapters, metadata };
}

// Generate HTML content for a chapter
function generateChapterHTML(results: TranslationResult[]): string {
  let html = '';
  
  for (const result of results) {
    html += `
    <div class="page" id="page-${result.page_number}">
      <div class="page-header">
        <h3>Page ${result.page_number}</h3>
      </div>
      
      <div class="page-content">
        <div class="translation">
          ${formatTextForHTML(result.translation)}
        </div>
        
        <div class="original" style="margin-top: 2em; padding-top: 1em; border-top: 1px solid #eee; color: #666; font-size: 0.9em;">
          <h4>Original Text:</h4>
          ${formatTextForHTML(result.original_text)}
        </div>
      </div>
    </div>
    `;
  }
  
  return html;
}

// Format text for HTML display
function formatTextForHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// Generate a simple HTML version for download (simplified EPUB)
export function generateSimpleEpubHTML(chapters: EpubChapter[], metadata: any): string {
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