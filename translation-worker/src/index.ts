import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import { initializeWorkerEnvironment } from './worker-polyfills.js';
import fs from 'fs';
import fsp from 'fs/promises'; // For async file operations if needed, and for unlink
import path from 'path'; // For joining paths for the new temp file
import { Readable } from 'stream'; // For converting fetch response to stream
import { finished } from 'stream/promises'; // For awaiting stream completion
import pdf from 'pdf-parse';
import { convert } from 'pdf-poppler';
import sharp from 'sharp';

console.log('=== WORKER ENTRYPOINT REACHED ===');
// Initialize serverless environment polyfills for the worker
initializeWorkerEnvironment();

// Load environment variables
dotenv.config();

// Redis connection configuration
const connection = new Redis(process.env.REDIS_CONNECTION_STRING!, {
  tls: {
    rejectUnauthorized: false // Adjust as per your Redis security settings
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

// Define response type from Gemini
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
  page_image: string; // base64 image data (Data URI)
  notes: string;
}

// Define the expected job data structure
interface PdfTranslationJobData {
  file: {
    name: string;
    type: string; 
    size: number;
  };
  blobUrl: string; // <<< New: URL of the file in Vercel Blob
  targetLanguage: string;
  userId?: string;
  userTier?: string; 
}

// Language mapping type
type LanguageMap = {
  [key: string]: string;
};

const languageMap: LanguageMap = {
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

// Helper: Render a PDF page to a PNG data URI using pdf-poppler and sharp
async function renderPageToImage(pdfPath: string, pageNumber: number): Promise<string> {
  const outputDir = path.dirname(pdfPath);
  const outputPrefix = path.join(outputDir, `page-${pageNumber}`);
  
  // Convert PDF page to PNG using pdf-poppler
  await convert(pdfPath, {
    out_dir: outputDir,
    out_prefix: `page-${pageNumber}`,
    page: pageNumber,
    format: 'png',
    scale: 1.5
  });

  // Read the generated PNG and convert to base64 using sharp
  const pngPath = `${outputPrefix}-1.png`;
  const imageBuffer = await fsp.readFile(pngPath);
  const base64Image = await sharp(imageBuffer)
    .resize(1500, null, { withoutEnlargement: true })
    .toBuffer()
    .then(buffer => `data:image/png;base64,${buffer.toString('base64')}`);

  // Clean up the temporary PNG file
  await fsp.unlink(pngPath);

  return base64Image;
}

// Helper: Extract text from PDF using pdf-parse
async function extractTextFromPdf(pdfPath: string): Promise<string[]> {
  const dataBuffer = await fsp.readFile(pdfPath);
  const data = await pdf(dataBuffer);
  // Split text by pages if possible (pdf-parse returns all text as one string)
  // For now, just return as a single page array
  return [data.text];
}

// Helper: Robust JSON parsing
function tryParseJSON(jsonString: string | undefined, pageNumber: number, job_id: string | number | undefined, attemptType: string) {
  if (!jsonString) {
    console.warn(`   ⚠️ Attempted to parse undefined/empty JSON string for ${attemptType} page ${pageNumber} (job ${job_id})`);
    return null;
  }
  try {
    return JSON.parse(jsonString);
  } catch (parseError) {
    console.error(`   ❌ Failed to parse ${attemptType} JSON for page ${pageNumber} (job ${job_id}):`, parseError);
    console.error(`   Broken ${attemptType} response fragment (job ${job_id}):`, jsonString?.slice(0, 500));
    let fixed = jsonString;
    const lastBrace = fixed.lastIndexOf('}');
    if (lastBrace !== -1) {
        // Ensure that we only trim if it seems like a truncated object or array
        const trimmed = fixed.slice(0, lastBrace + 1);
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            fixed = trimmed;
        } else {
            console.warn(`   ⚠️ JSON trimming for ${attemptType} page ${pageNumber} (job ${job_id}) might result in invalid JSON as it does not start/end with braces/brackets.`);
        }
    } else {
        console.warn(`   ⚠️ No closing brace found for ${attemptType} page ${pageNumber} (job ${job_id}) JSON, cannot trim.`);
        return null; // Cannot fix if no closing brace
    }

    try { 
      const parsed = JSON.parse(fixed); 
      console.warn(`   ✅ Successfully parsed ${attemptType} page ${pageNumber} (job ${job_id}) after trimming.`);
      return parsed;
    } catch (e2) {
      console.error(`   ❌ Still failed to parse ${attemptType} for page ${pageNumber} (job ${job_id}) after trimming:`, e2);
      return null; // Indicate failure to parse
    }
  }
}

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// Create worker
const worker = new Worker<
  PdfTranslationJobData,      
  TranslationResult[]         
>(
  QUEUE_NAME,
  async (job: Job<PdfTranslationJobData, TranslationResult[]>) => {
    const { file, blobUrl, targetLanguage, userId, userTier } = job.data;
    const { name: originalFilename } = file;

    // Determine Gemini Model based on User Tier
    const geminiModel = userTier === 'pro' ? 'gemini-2.0-flash' : 'gemini-1.5-flash-8b';
    
    // --- Download file from Vercel Blob to a local temp path for the worker ---
    // Create a unique local temporary path for the worker
    const workerTempDir = '/tmp/worker-pdfs'; // Worker's internal temp directory
    await fsp.mkdir(workerTempDir, { recursive: true }); // Ensure directory exists
    const workerTempFilePath = path.join(workerTempDir, `${job.id}-${path.basename(originalFilename)}`);
    let downloadSuccess = false;

    console.log(`🚀 Processing PDF translation job ${job.id}: "${originalFilename}" (from Blob URL: ${blobUrl}) for user ${userId || 'anonymous'} (Tier: ${userTier || 'default'}, Model: ${geminiModel})`);
    
    try {
      console.log(`⬇️ Worker job ${job.id}: Downloading from ${blobUrl} to ${workerTempFilePath}...`);
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file from Vercel Blob: ${response.status} ${response.statusText}. URL: ${blobUrl}`);
      }
      if (!response.body) {
        throw new Error('Response body is null when downloading from Vercel Blob.');
      }
      // Stream the download to the file
      const fileStream = fs.createWriteStream(workerTempFilePath);
      // Type assertion for response.body as ReadableStream is often needed for Node.js fetch
      await finished(Readable.fromWeb(response.body as import('stream/web').ReadableStream).pipe(fileStream));
      downloadSuccess = true;
      console.log(`✅ Worker job ${job.id}: Successfully downloaded to ${workerTempFilePath}`);
      // --- End Download ---  
      
      await job.updateProgress(0);

      // Read the file from the worker's new local temporary path
      // Use pdf-parse to extract all text from the PDF
      const allPageTexts = await extractTextFromPdf(workerTempFilePath);
      // For now, assign all text to the first page (improve later for per-page extraction)
      const totalPages = 1;

      console.log(`📄 PDF "${originalFilename}" has ${totalPages} page(s).`);
      const allPageResults: TranslationResult[] = [];
      let lastReportedProgress = -1;

      if (job.progress !== 0) {
          await job.updateProgress(0);
          lastReportedProgress = 0;
      } else {
          lastReportedProgress = 0;
      }

      for (let i = 1; i <= totalPages; i++) {
        const currentPageNumber = i;
        let pageNotes = `Model: ${geminiModel}.`;
        let processingStartTime = Date.now();

        console.log(`📄 Processing page ${currentPageNumber}/${totalPages} of "${originalFilename}" for job ${job.id}`);
        if (!(await job.isActive())) {
          console.warn(`⚠️ Job ${job.id} was cancelled. Stopping processing for "${originalFilename}".`);
          throw new Error('Job cancelled by user');
        }

        // Use allPageTexts[0] for now
        const originalPageText = allPageTexts[0] || '';
        const pageImageBase64 = await renderPageToImage(workerTempFilePath, currentPageNumber);
        const imageOnly = originalPageText.trim().length < 20;
        pageNotes += ` Mode: ${imageOnly ? 'Image-Only' : 'Text+Image'}.`;
        console.log(`   📄 Page ${currentPageNumber}: Extracted text length: ${originalPageText.length}, ${pageNotes}`);

        const targetLangName = languageMap[targetLanguage] || targetLanguage;

        let finalExtractedText = imageOnly ? "[Image text to be extracted by Gemini]" : originalPageText;
        let finalTranslatedText = "[Translation pending]";
        let attemptSuccess = false;

        const geminiApiKey = process.env.GOOGLE_API_KEY;
        if (!geminiApiKey) {
            console.error("❌ GOOGLE_API_KEY is not set for job", job.id);
            throw new Error("GOOGLE_API_KEY environment variable is not set.");
        }

        // --- Attempt 1: Combined Extraction and Translation ---
        const combinedPromptParts: any[] = [];
        if (imageOnly) {
          combinedPromptParts.push({ inlineData: { mimeType: "image/png", data: pageImageBase64.split(',')[1] } });
          combinedPromptParts.push({ text: `Extract ALL text from this image and translate it to ${targetLangName}. Be thorough. This is Page ${currentPageNumber} of ${totalPages} from document titled "${originalFilename}".` });
        } else {
          combinedPromptParts.push({ inlineData: { mimeType: "image/png", data: pageImageBase64.split(',')[1] } });
          combinedPromptParts.push({ text: `Review page ${currentPageNumber} of ${totalPages} from document "${originalFilename}". First, extract all original text. Second, translate that extracted text to ${targetLangName}. Original text to process if clear: ###${originalPageText}###` });
        }

        const combinedRequestBody = {
          contents: [{ parts: combinedPromptParts }],
          generationConfig: { temperature: 0.1, topK: 1, topP: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties: {
              extracted_text: { type: "STRING", description: "Original text extracted/identified from the page/image." },
              translated_text: { type: "STRING", description: `Clean and complete translation of the extracted text into ${targetLangName}.` },
              page_info: { type: "OBJECT", properties: { has_text: { type: "BOOLEAN" }, content_type: { type: "STRING", enum: ["text", "image", "diagram", "table", "mixed", "text_only_input"] }}, required: ["has_text", "content_type"] }
            }, required: ["extracted_text", "translated_text", "page_info"] }
          }
        };

        console.log(`   🌐 Attempting Combined Ext/Trans for page ${currentPageNumber} (job ${job.id}) using ${geminiModel}...`);
        processingStartTime = Date.now();
        const combinedResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(combinedRequestBody), signal: AbortSignal.timeout(90000)
        });
        const combinedResponseTime = Date.now() - processingStartTime;

        if (combinedResponse.ok) {
          const combinedResultJson = await combinedResponse.json() as GeminiResponse;
          const combinedStructResponse = combinedResultJson.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = tryParseJSON(combinedStructResponse, currentPageNumber, job.id, "Combined");
          if (parsed && parsed.extracted_text && parsed.translated_text) {
            finalExtractedText = parsed.extracted_text;
            finalTranslatedText = parsed.translated_text;
            pageNotes += ` | Combined SUCCESS (${combinedResponseTime}ms). Content: ${parsed.page_info?.content_type || 'unknown'}.`;
            attemptSuccess = true;
          } else {
            pageNotes += ` | Combined ParseFAIL/MissingFields (${combinedResponseTime}ms). Raw: ${combinedStructResponse ? combinedStructResponse.substring(0,100) + '...': 'NO_RESPONSE_TEXT'}`; 
          }
        } else {
          const errorText = await combinedResponse.text();
          console.error(`   ❌ Combined Ext/Trans API error page ${currentPageNumber} (job ${job.id}):`, combinedResponse.status, errorText.substring(0,200));
          pageNotes += ` | Combined API Error: ${combinedResponse.status} (${combinedResponseTime}ms).`;
        }

        // --- Fallback: Separate Extraction and Translation if Combined failed ---
        if (!attemptSuccess) {
          console.warn(`   ⚠️ Combined Ext/Trans failed for page ${currentPageNumber}. Attempting fallback...`);
          pageNotes += ` | Fallback Initiated.`;

          // Step 1: Extract Text Only
          const extractParts: any[] = [{ inlineData: { mimeType: "image/png", data: pageImageBase64.split(',')[1] } }];
          extractParts.push({ text: `Extract ALL text content from this image (page ${currentPageNumber}/${totalPages} of document "${originalFilename}"). Provide only the extracted text.` });
          
          const extractRequestBody = {
            contents: [{ parts: extractParts }],
            generationConfig: { temperature: 0.0, topK: 1, maxOutputTokens: 4096, responseMimeType: "application/json",
              responseSchema: { type: "OBJECT", properties: { extracted_text: { type: "STRING", description: "All text content extracted from the image." } }, required: ["extracted_text"] }
            }
          };
          console.log(`     Fallback Step 1: Extracting text for page ${currentPageNumber} using ${geminiModel}...`);
          const extractStartTime = Date.now();
          const extractResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(extractRequestBody), signal: AbortSignal.timeout(60000)
          });
          const extractResponseTime = Date.now() - extractStartTime;

          let extractedTextForFallback: string | null = null;
          if (extractResponse.ok) {
            const extractResultJson = await extractResponse.json() as GeminiResponse;
            const extractStructResponse = extractResultJson.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsedExtract = tryParseJSON(extractStructResponse, currentPageNumber, job.id, "Extract-Fallback");
            if (parsedExtract && parsedExtract.extracted_text && typeof parsedExtract.extracted_text === 'string') {
              extractedTextForFallback = parsedExtract.extracted_text;
              finalExtractedText = parsedExtract.extracted_text;
              pageNotes += ` | FB-Extract SUCCESS (${extractResponseTime}ms).`;
            } else { pageNotes += ` | FB-Extract ParseFAIL (${extractResponseTime}ms). Raw: ${extractStructResponse ? extractStructResponse.substring(0,100) + '...': 'NO_RESPONSE_TEXT'}`; }
          } else { 
            const errorText = await extractResponse.text();
            console.error(`     ❌ Fallback Extract API error page ${currentPageNumber}:`, extractResponse.status, errorText.substring(0,200));
            pageNotes += ` | FB-Extract API Error: ${extractResponse.status} (${extractResponseTime}ms).`; 
          }

          // Step 2: Translate Extracted Text (if extraction was successful and produced text)
          if (extractedTextForFallback !== null && extractedTextForFallback.trim().length > 0) {
            // After this check, extractedTextForFallback is definitely a non-empty string.
            const textToUseInPrompt: string = extractedTextForFallback!;

            const translateParts: any[] = [{ text: `Translate the following text accurately to ${targetLangName}. Preserve the original meaning and structure where possible. Text to translate: ###${textToUseInPrompt}###` }];
            const translateRequestBody = {
              contents: [{ parts: translateParts }],
              generationConfig: { temperature: 0.1, topK: 1, maxOutputTokens: 4096, responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { translated_text: { type: "STRING", description: `Clean and complete translation into ${targetLangName}.` } }, required: ["translated_text"] }
              }
            };
            console.log(`     Fallback Step 2: Translating text for page ${currentPageNumber} using ${geminiModel}...`);
            const translateStartTime = Date.now();
            const translateResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(translateRequestBody), signal: AbortSignal.timeout(60000)
            });
            const translateResponseTime = Date.now() - translateStartTime;

            if (translateResponse.ok) {
              const translateResultJson = await translateResponse.json() as GeminiResponse;
              const translateStructResponse = translateResultJson.candidates?.[0]?.content?.parts?.[0]?.text;
              const parsedTranslate = tryParseJSON(translateStructResponse, currentPageNumber, job.id, "Translate-Fallback");
              if (parsedTranslate && parsedTranslate.translated_text) {
                finalTranslatedText = parsedTranslate.translated_text;
                pageNotes += ` | FB-Translate SUCCESS (${translateResponseTime}ms).`;
                attemptSuccess = true; // Mark overall success if fallback translation worked
              } else { pageNotes += ` | FB-Translate ParseFAIL (${translateResponseTime}ms). Raw: ${translateStructResponse ? translateStructResponse.substring(0,100) + '...': 'NO_RESPONSE_TEXT'}`; }
            } else { 
              const errorText = await translateResponse.text();
              console.error(`     ❌ Fallback Translate API error page ${currentPageNumber}:`, translateResponse.status, errorText.substring(0,200));
              pageNotes += ` | FB-Translate API Error: ${translateResponse.status} (${translateResponseTime}ms).`; 
            }
          } else if (extractedTextForFallback === null) {
            pageNotes += ` | FB-Translate SKIPPED (extraction failed).`;
            finalTranslatedText = imageOnly ? "[Image, no text from failed extraction fallback]" : "[No text from failed extraction fallback]";
          } else if (extractedTextForFallback.trim().length === 0) {
             pageNotes += ` | FB-Translate SKIPPED (no text content found by extraction).`;
             finalTranslatedText = imageOnly ? "[Image, no text content found by fallback extraction]" : "[No text content found by fallback extraction]";
          }
        }
        
        if (!attemptSuccess) {
            finalTranslatedText = finalTranslatedText === "[Translation pending]" ? "[Translation failed after all attempts]" : finalTranslatedText;
            if (finalExtractedText === "[Image text to be extracted by Gemini]" && imageOnly) finalExtractedText = "[Image, text extraction failed]"
        }

        const pageResult: TranslationResult = {
          page_number: currentPageNumber,
          original_text: finalExtractedText,
          translated_text: finalTranslatedText,
          page_image: pageImageBase64,
          notes: pageNotes.trim()
        };
        allPageResults.push(pageResult);

        console.log(`   ✅ Page ${currentPageNumber}/${totalPages} processing completed for job ${job.id}. Notes: ${pageNotes}`);
        const progress = Math.round((currentPageNumber / totalPages) * 100);
        // Only update progress if it has changed
        if (progress > lastReportedProgress && progress < 100) { // Avoid redundant 100% update here
          await job.updateProgress(progress);
          lastReportedProgress = progress;
        }
      }

      // Clean up the worker's local temporary file after processing
      if (downloadSuccess) { // Only attempt to unlink if download was successful and file was created
        fs.unlink(workerTempFilePath, (err) => { // <<< Use workerTempFilePath
          if (err) {
            console.warn(`⚠️ Failed to delete worker's temporary file ${workerTempFilePath} for job ${job.id}:`, err);
          } else {
            console.log(`🗑️ Deleted worker's temporary file ${workerTempFilePath} for job ${job.id}`);
          }
        });
      }

      console.log(`✅ PDF "${originalFilename}" (job ${job.id}) processing finished. ${allPageResults.length} pages handled.`);
      // Ensure final 100% progress is always reported
      if (lastReportedProgress < 100) {
        await job.updateProgress(100);
      }
      return allPageResults;

    } catch (error: any) {
      console.error(`❌❌ Overall PDF translation job ${job.id} ("${originalFilename}") failed catastrophically:`, error.message, error.stack);
      const finalErrorMessage = error.message || 'Worker job for PDF failed with an unhandled error';
      await job.updateProgress(job.progress || 0); 
      // Also attempt to delete the worker's local temp file on catastrophic failure
      if (downloadSuccess && fs.existsSync(workerTempFilePath)) { // <<< Use workerTempFilePath
        fs.unlink(workerTempFilePath, (unlinkErr) => {
          if (unlinkErr) console.warn(`⚠️ Failed to delete worker's temp file ${workerTempFilePath} during error handling:`, unlinkErr);
          else console.log(`🗑️ Deleted worker's temp file ${workerTempFilePath} during error handling.`);
        });
      }
      await job.moveToFailed(new Error(finalErrorMessage), 'worker-error-queue', true);
      throw error;
    }
  },
  {
    connection,
    concurrency: process.env.WORKER_CONCURRENCY ? parseInt(process.env.WORKER_CONCURRENCY) : 1, 
    limiter: { max: 100, duration: 1000 },
    lockDuration: 300000, // 5 minutes, to prevent lock mismatch on long jobs
    // removeStalledJobs: true, // Consider this for production to clean up truly stalled jobs
  }
);

worker.on('completed', (job: Job<PdfTranslationJobData, TranslationResult[]>, result: TranslationResult[]) => {
  console.log(`🎉 Job ${job.id} for "${job.data.file.name}" completed with ${result.length} page results.`);
});

worker.on('failed', (job, err) => {
  console.error(`🔥 Job ${job?.id} for "${job?.data.file.name}" failed overall:`, err.message, err.stack);
});

worker.on('progress', (job, progress) => {
  // Ensure progress is a number before performing arithmetic
  const numericProgress = Number(progress);
  // Only log progress every 10% or when it's 0% or 100% to reduce noise, 
  // or if it's a specific update like the first or last meaningful change.
  if (!isNaN(numericProgress) && (numericProgress % 10 === 0 || numericProgress === 0 || numericProgress === 100 || numericProgress === 1)) {
    console.log(`📈 Job ${job.id} for "${job.data.file.name}" progress: ${numericProgress}%`);
  }
});

process.on('SIGTERM', async () => {
  console.log(' SIGTERM received. Closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(' SIGINT received. Closing worker...');
  await worker.close();
  process.exit(0);
});

console.log('✨ PDF Translation Worker (v2.1 with fallback & tiering) started successfully ✨'); 