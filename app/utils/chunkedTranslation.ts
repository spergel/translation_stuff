import { TranslationResult, TargetLanguage, UserTier } from '../types/translation';

// Declare the PDF.js types we need
declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (config: { data: Uint8Array }) => {
        promise: Promise<PDFDocumentProxy>;
      };
      GlobalWorkerOptions: {
        workerSrc: string;
      };
    };
  }
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (config: { scale: number }) => PDFPageViewport;
  render: (config: { canvasContext: CanvasRenderingContext2D; viewport: PDFPageViewport }) => PDFRenderTask;
}

interface PDFPageViewport {
  width: number;
  height: number;
}

interface PDFRenderTask {
  promise: Promise<void>;
}

export interface TranslationOptions {
  file: File;
  targetLanguage: TargetLanguage;
  userTier: UserTier;
  userId?: string;
  onProgress?: (progress: number, message: string) => void;
  onPageComplete?: (result: TranslationResult) => void;
  signal?: AbortSignal;
}

export async function processDocumentChunked(options: TranslationOptions): Promise<TranslationResult[]> {
  const { file, targetLanguage, userTier, userId, onProgress, onPageComplete, signal } = options;
  
  console.log('🚀 Starting unified document processing:', {
    fileName: file.name,
    fileSize: file.size,
    targetLanguage,
    userTier,
    userId: userId ? 'authenticated' : 'anonymous',
    timestamp: new Date().toISOString()
  });
  
  try {
    // Update progress
    if (onProgress) {
      onProgress(5, 'Initializing document processing...');
    }

    console.log('📁 File details:', {
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: file.type
    });
    
    // Convert PDF to images using PDF.js on the frontend
    if (onProgress) {
      onProgress(10, 'Converting PDF to images...');
    }
    
    console.log('🖼️ Converting PDF to images using PDF.js...');
    const pageImages = await convertPDFToImages(file, onProgress);
    console.log('✅ PDF converted to images, pages:', pageImages.length);
    
    // Process images in batches to avoid payload size limits
    if (onProgress) {
      onProgress(30, `⚠️  STAY ON THIS PAGE - Processing ${pageImages.length} pages in batches...`);
    }
    
    console.log('📦 Processing images in batches due to size:', {
      totalPages: pageImages.length,
      estimatedSize: `${(pageImages.reduce((sum, img) => sum + img.length, 0) / 1024 / 1024).toFixed(1)}MB`
    });
    
    const BATCH_SIZE = 5; // Process 5 pages at a time to stay under limits
    const batches = [];
    
    for (let i = 0; i < pageImages.length; i += BATCH_SIZE) {
      batches.push(pageImages.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📊 Split into ${batches.length} batches of max ${BATCH_SIZE} pages each`);
    
    const allResults: TranslationResult[] = [];
    const firebaseRegion = 'us-central1';
    const firebaseProject = 'translation-461511';
    const functionUrl = `https://${firebaseRegion}-${firebaseProject}.cloudfunctions.net/translateDocument`;
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchStartPage = (batchIndex * BATCH_SIZE) + 1;
      const batchEndPage = Math.min(batchStartPage + batch.length - 1, pageImages.length);
      
      if (onProgress) {
        const progressPercent = 30 + (60 * batchIndex / batches.length);
        onProgress(progressPercent, `⚠️  STAY ON PAGE - Translating pages ${batchStartPage}-${batchEndPage} of ${pageImages.length}...`);
      }
      
      console.log(`📤 Processing batch ${batchIndex + 1}/${batches.length}: pages ${batchStartPage}-${batchEndPage}`);
      
      const requestBody = {
        pageImages: batch,
        fileName: file.name,
        targetLanguage,
        userTier,
        userId,
        batchInfo: {
          batchIndex,
          totalBatches: batches.length,
          startPage: batchStartPage,
          endPage: batchEndPage,
          totalPages: pageImages.length
        }
      };
      
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal,
        });

        console.log(`📥 Batch ${batchIndex + 1} response:`, response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${batchIndex + 1} error:`, errorText);
          throw new Error(`Translation service error for batch ${batchIndex + 1}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Batch ${batchIndex + 1} completed:`, {
          success: data.success,
          resultsCount: data.results?.length || 0,
          processingTime: data.processingTimeMs
        });
        
        // Add results to our collection
        if (data.results) {
          allResults.push(...data.results);
          
          // Call onPageComplete for each result in this batch
          if (onPageComplete) {
            data.results.forEach((result: TranslationResult) => {
              console.log(`📄 Page ${result.page_number} completed`);
              onPageComplete(result);
            });
          }
        }
        
      } catch (error) {
        console.error(`💥 Error processing batch ${batchIndex + 1}:`, error);
        throw new Error(`Failed to process pages ${batchStartPage}-${batchEndPage}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    if (onProgress) {
      onProgress(100, `✅ Translation complete! Processed ${allResults.length} pages successfully.`);
    }

    console.log('🎉 All batches completed successfully:', {
      fileName: file.name,
      totalBatches: batches.length,
      pagesProcessed: allResults.length,
      userId: userId ? 'authenticated' : 'anonymous'
    });
    
    return allResults;
    
  } catch (error) {
    console.error('💥 Translation processing error:', error);
    console.error('🔍 Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

// Helper function to convert PDF to images using PDF.js on the frontend
async function convertPDFToImages(file: File, onProgress?: (progress: number, message: string) => void): Promise<string[]> {
  console.log('🔄 Starting PDF to images conversion using PDF.js...', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type
  });
  
  try {
    // Load PDF.js if not already loaded
    if (!window.pdfjsLib) {
      console.log('📦 PDF.js not loaded, loading now...');
      await loadPDFJS();
    } else {
      console.log('✅ PDF.js already available');
    }
    
    // Convert file to array buffer
    console.log('🔄 Converting file to array buffer...');
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    console.log('✅ File converted to array buffer, size:', data.length);
    
    // Load PDF document
    console.log('📋 Loading PDF document...');
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const numPages = pdf.numPages;
    
    console.log(`📄 PDF loaded successfully!`, { numPages, hasPages: numPages > 0 });
    
    if (!numPages || numPages === 0) {
      throw new Error('PDF has no pages or failed to load properly');
    }
    
    const pageImages: string[] = [];
  
  // Convert each page to image
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    console.log(`🖼️ Processing page ${pageNum}/${numPages}...`);
    
    if (onProgress) {
      onProgress(10 + (20 * pageNum / numPages), `Converting page ${pageNum}/${numPages}...`);
    }
    
    const page = await pdf.getPage(pageNum);
    
    // Set up canvas
    const scale = 2.0; // Higher scale for better quality
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    
    // Convert canvas to base64 image
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64Image = imageDataUrl.split(',')[1]; // Remove data:image/jpeg;base64, prefix
    
    pageImages.push(base64Image);
    console.log(`✅ Page ${pageNum} converted to image, size: ${(base64Image.length / 1024).toFixed(1)}KB`);
  }
  
  console.log('🎉 All pages converted to images successfully');
  return pageImages;
  
  } catch (error) {
    console.error('💥 Error converting PDF to images:', error);
    console.error('🔍 Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      fileName: file.name
    });
    throw error;
  }
}

// Helper function to load PDF.js library
async function loadPDFJS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      console.log('✅ PDF.js already loaded');
      resolve();
      return;
    }
    
    console.log('📥 Loading PDF.js library...');
    
    // Load PDF.js library from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    
    script.onload = () => {
      console.log('📦 PDF.js script loaded, checking availability...');
      
      // Wait a bit for the library to be available
      setTimeout(() => {
        if (window.pdfjsLib) {
          console.log('🔧 Setting up PDF.js worker...');
          // Use CDN worker as well for compatibility
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          console.log('✅ PDF.js loaded and configured successfully');
          resolve();
        } else {
          console.error('❌ PDF.js not available after script load');
          reject(new Error('PDF.js not available after script load'));
        }
      }, 100);
    };
    
    script.onerror = (error) => {
      console.error('❌ Failed to load PDF.js script:', error);
      reject(new Error('Failed to load PDF.js from CDN'));
    };
    
    document.head.appendChild(script);
  });
} 