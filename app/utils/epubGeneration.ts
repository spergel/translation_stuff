import { TranslationResult, ChapterInfo } from '../types/translation';

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

// Generate complete EPUB package (simplified format)
export function generateEpubPackage(chapters: EpubChapter[], metadata: any): {
  mimetype: string;
  containerXML: string;
  packageOPF: string;
  tocNCX: string;
  chapterFiles: { filename: string; content: string }[];
  stylesCSS: string;
} {
  const chapterFiles = chapters.map((chapter, index) => ({
    filename: `chapter${index + 1}.xhtml`,
    content: generateChapterXHTML(chapter, metadata)
  }));
  
  return {
    mimetype: 'application/epub+zip',
    containerXML: generateContainerXML(),
    packageOPF: generatePackageOPF(metadata, chapterFiles),
    tocNCX: generateTocNCX(metadata, chapters),
    chapterFiles,
    stylesCSS: generateStylesCSS()
  };
}

function generateChapterXHTML(chapter: EpubChapter, metadata: any): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chapter.title}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <div class="chapter">
    <h1>${chapter.title}</h1>
    ${chapter.content}
  </div>
</body>
</html>`;
}

function generateContainerXML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function generatePackageOPF(metadata: any, chapterFiles: { filename: string }[]): string {
  const manifestItems = chapterFiles.map((file, index) => 
    `<item id="chapter${index + 1}" href="${file.filename}" media-type="application/xhtml+xml"/>`
  ).join('\n    ');
  
  const spineItems = chapterFiles.map((_, index) => 
    `<itemref idref="chapter${index + 1}"/>`
  ).join('\n    ');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${metadata.title}</dc:title>
    <dc:creator opf:role="aut">${metadata.author}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
    <dc:publisher>${metadata.publisher}</dc:publisher>
    <dc:date>${metadata.published}</dc:date>
    <dc:description>${metadata.description}</dc:description>
    <dc:identifier id="BookId">urn:uuid:${generateUUID()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="stylesheet" href="styles.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine toc="ncx">
    ${spineItems}
  </spine>
</package>`;
}

function generateTocNCX(metadata: any, chapters: EpubChapter[]): string {
  const navPoints = chapters.map((chapter, index) => `
    <navPoint id="navpoint-${index + 1}" playOrder="${index + 1}">
      <navLabel>
        <text>${chapter.title}</text>
      </navLabel>
      <content src="chapter${index + 1}.xhtml"/>
    </navPoint>`
  ).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${generateUUID()}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${metadata.title}</text>
  </docTitle>
  <navMap>
    ${navPoints}
  </navMap>
</ncx>`;
}

function generateStylesCSS(): string {
  return `
body {
  font-family: Georgia, serif;
  line-height: 1.6;
  margin: 0;
  padding: 1em;
  color: #333;
}

.chapter {
  max-width: 40em;
  margin: 0 auto;
}

h1 {
  color: #2c5aa0;
  border-bottom: 2px solid #2c5aa0;
  padding-bottom: 0.5em;
  margin-bottom: 1.5em;
}

h3 {
  color: #666;
  margin-top: 2em;
  margin-bottom: 0.5em;
}

h4 {
  color: #999;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-size: 1em;
}

.page {
  margin-bottom: 3em;
  padding-bottom: 2em;
  border-bottom: 1px solid #eee;
}

.page-header {
  margin-bottom: 1em;
}

.page-content {
  text-align: justify;
}

.translation {
  font-size: 1.1em;
  line-height: 1.7;
}

.original {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid #eee;
  color: #666;
  font-size: 0.9em;
}

p {
  margin-bottom: 1em;
}

@page {
  margin: 2cm;
}
`;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
} 