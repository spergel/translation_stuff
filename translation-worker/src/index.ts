import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import pdf from 'pdf-parse';
import { convert } from 'pdf-poppler';
import sharp from 'sharp';

// Load environment variables
dotenv.config();

// Redis connection configuration
const connection = new Redis(process.env.REDIS_CONNECTION_STRING!, {
  tls: {
    rejectUnauthorized: false
  },
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

connection.on('connect', () => console.log('🔗 Worker: Redis connected'));
connection.on('error', (err: Error) => console.error('❌ Worker: Redis connection error:', err));

// Queue name
const QUEUE_NAME = 'translation-jobs';

// Define Gemini API response type
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// Define the structure of the translation result for a single page
interface TranslationResult {
  page_number: number;
  original_text: string;
  translated_text: string;
  page_image: string; // base64 image data
  notes: string;
}

// Define the expected job data structure
interface PdfTranslationJobData {
  file: {
    name: string;
    type: string;
    size: number;
  };
  blobUrl: string;
  targetLanguage: string;
  userId?: string;
  userTier?: string;
}

// Language mapping
const languageMap: { [key: string]: string } = {
  'chinese': 'Traditional Chinese',
  'english': 'English',
  'japanese': 'Japanese',
  'korean': 'Korean',
  'spanish': 'Spanish',
  'french': 'French',
  'german': 'German',
  'italian': 'Italian',
  'portuguese': 'Portuguese',
  'russian': 'Russian',
  'arabic': 'Arabic'
};

// Helper: Render a PDF page to a PNG data URI
async function renderPageToImage(pdfPath: string, pageNumber: number): Promise<string> {
  const outputDir = path.dirname(pdfPath);
  const outputPrefix = path.join(outputDir, `page-${pageNumber}`);
  
  await convert(pdfPath, {
    out_dir: outputDir,
    out_prefix: `page-${pageNumber}`,
    page: pageNumber,
    format: 'png',
    scale: 1.5
  });

  const pngPath = `${outputPrefix}-1.png`;
  const imageBuffer = await fsp.readFile(pngPath);
  const base64Image = await sharp(imageBuffer)
    .resize(1500, null, { withoutEnlargement: true })
    .toBuffer()
    .then(buffer => `data:image/png;base64,${buffer.toString('base64')}`);

  await fsp.unlink(pngPath);
  return base64Image;
}

// Helper: Extract text from PDF
async function extractTextFromPdf(pdfPath: string): Promise<string[]> {
  const dataBuffer = await fsp.readFile(pdfPath);
  const data = await pdf(dataBuffer);
  return [data.text];
}

// Helper: Call Gemini API with retry for long texts
async function callGeminiAPI(prompt: string, geminiModel: string, geminiApiKey: string): Promise<string> {
  const MAX_CHARS = 4000; // Approximate max chars for a single request
  
  if (prompt.length <= MAX_CHARS) {
    // Single request for short text
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const result = await response.json() as GeminiResponse;
    return result.candidates?.[0]?.content?.parts?.[0]?.text || "[Translation failed]";
  } else {
    // Split long text into two parts
    const midPoint = Math.floor(prompt.length / 2);
    // Try to find a good breaking point (end of sentence or paragraph)
    const breakPoint = prompt.lastIndexOf('.', midPoint) + 1 || prompt.lastIndexOf('\n', midPoint) + 1 || midPoint;
    
    const firstHalf = prompt.substring(0, breakPoint);
    const secondHalf = prompt.substring(breakPoint);

    // Make two separate API calls
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: firstHalf }] }],
          generationConfig: { temperature: 0.1 }
        })
      }),
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: secondHalf }] }],
          generationConfig: { temperature: 0.1 }
        })
      })
    ]);

    if (!firstResponse.ok || !secondResponse.ok) {
      throw new Error(`Gemini API error in split request: ${firstResponse.status} / ${secondResponse.status}`);
    }

    const [firstResult, secondResult] = await Promise.all([
      firstResponse.json() as Promise<GeminiResponse>,
      secondResponse.json() as Promise<GeminiResponse>
    ]);

    const firstText = firstResult.candidates?.[0]?.content?.parts?.[0]?.text || "[First part translation failed]";
    const secondText = secondResult.candidates?.[0]?.content?.parts?.[0]?.text || "[Second part translation failed]";

    return `${firstText} ${secondText}`;
  }
}

// Create worker
const worker = new Worker<PdfTranslationJobData, TranslationResult[]>(
  QUEUE_NAME,
  async (job: Job<PdfTranslationJobData, TranslationResult[]>) => {
    const { file, blobUrl, targetLanguage, userId, userTier } = job.data;
    const { name: originalFilename } = file;

    // Determine Gemini Model based on User Tier
    const geminiModel = userTier === 'pro' ? 'gemini-2.0-flash' : 'gemini-1.5-flash-8b';
    
    // Create temp directory and file path
    const workerTempDir = '/tmp/worker-pdfs';
    await fsp.mkdir(workerTempDir, { recursive: true });
    const workerTempFilePath = path.join(workerTempDir, `${job.id}-${path.basename(originalFilename)}`);
    let downloadSuccess = false;

    console.log(`🚀 Processing PDF translation job ${job.id}: "${originalFilename}"`);
    
    try {
      // Download file from Vercel Blob
      console.log(`⬇️ Downloading from ${blobUrl} to ${workerTempFilePath}...`);
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('Response body is null');
      }

      const fileStream = fs.createWriteStream(workerTempFilePath);
      await finished(Readable.fromWeb(response.body as import('stream/web').ReadableStream).pipe(fileStream));
      downloadSuccess = true;
      console.log(`✅ Downloaded to ${workerTempFilePath}`);

      // Process PDF
      const allPageTexts = await extractTextFromPdf(workerTempFilePath);
      const totalPages = 1; // For now, treat as single page
      const allPageResults: TranslationResult[] = [];

      for (let i = 1; i <= totalPages; i++) {
        const currentPageNumber = i;
        let pageNotes = `Model: ${geminiModel}.`;
        
        console.log(`📄 Processing page ${currentPageNumber}/${totalPages}`);
        
        const originalPageText = allPageTexts[0] || '';
        const pageImageBase64 = await renderPageToImage(workerTempFilePath, currentPageNumber);
        const imageOnly = originalPageText.trim().length < 20;
        pageNotes += ` Mode: ${imageOnly ? 'Image-Only' : 'Text+Image'}.`;

        const targetLangName = languageMap[targetLanguage] || targetLanguage;
        let finalExtractedText = imageOnly ? "[Image text to be extracted]" : originalPageText;
        let finalTranslatedText = "[Translation pending]";

        // Call Gemini API for translation
        const geminiApiKey = process.env.GOOGLE_API_KEY;
        if (!geminiApiKey) {
          throw new Error("GOOGLE_API_KEY environment variable is not set");
        }

        try {
          const prompt = imageOnly
            ? `Extract ALL text from this image and translate it to ${targetLangName}. Be thorough.`
            : `Translate the following text to ${targetLangName}: ${originalPageText}`;

          finalTranslatedText = await callGeminiAPI(prompt, geminiModel, geminiApiKey);
          pageNotes += ` Translation successful.`;
        } catch (error: any) {
          console.error(`Translation error for page ${currentPageNumber}:`, error);
          pageNotes += ` Translation failed: ${error.message || 'Unknown error'}.`;
          finalTranslatedText = "[Translation failed]";
        }

        const pageResult: TranslationResult = {
          page_number: currentPageNumber,
          original_text: finalExtractedText,
          translated_text: finalTranslatedText,
          page_image: pageImageBase64,
          notes: pageNotes.trim()
        };
        allPageResults.push(pageResult);

        await job.updateProgress(Math.round((currentPageNumber / totalPages) * 100));
      }

      // Clean up
      if (downloadSuccess) {
        await fsp.unlink(workerTempFilePath);
        console.log(`🗑️ Deleted temporary file ${workerTempFilePath}`);
      }

      return allPageResults;

    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      if (downloadSuccess) {
        await fsp.unlink(workerTempFilePath).catch(console.error);
      }
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
    limiter: { max: 100, duration: 1000 }
  }
);

worker.on('completed', (job, result) => {
  console.log(`🎉 Job ${job.id} completed with ${result.length} page results`);
});

worker.on('failed', (job, err) => {
  console.error(`🔥 Job ${job?.id} failed:`, err.message);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing worker...');
  await worker.close();
  process.exit(0);
});

console.log('✨ PDF Translation Worker started successfully ✨'); 