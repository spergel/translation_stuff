import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { TranslationResult } from '@/app/types/translation';

// Debug logging
console.log('Redis Connection String:', process.env.REDIS_CONNECTION_STRING);

// Redis connection configuration
const connection = new IORedis(process.env.REDIS_CONNECTION_STRING!, {
  tls: {
    rejectUnauthorized: false
  },
  maxRetriesPerRequest: null, // BullMQ requires this to be null
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  }
});

// Queue names
export const QUEUE_NAMES = {
  TRANSLATION: 'translation-jobs',
} as const;

// Create queues
export const translationQueue = new Queue(QUEUE_NAMES.TRANSLATION, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 24 * 3600, // Keep failed jobs for 24 hours
      count: 1000, // Keep last 1000 failed jobs
    }
  },
});

// Worker configuration
const worker = new Worker(
  QUEUE_NAMES.TRANSLATION,
  async (job) => {
    console.log('Processing job:', job.id);
    const { file, targetLanguage, userId, userTier } = job.data;

    try {
      // Update progress to 0
      await job.updateProgress(0);

      // Process the file in chunks
      const results: TranslationResult[] = [];
      const totalPages = 10; // TODO: Get actual page count from PDF

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        // Check if job was cancelled
        if (!(await job.isActive())) {
          return { status: 'cancelled' };
        }

        // Process each page
        const pageResult = await processPage(file, pageNumber, targetLanguage, totalPages);
        results.push(pageResult);

        // Update progress
        const progress = Math.round((pageNumber / totalPages) * 100);
        await job.updateProgress(progress);
      }

      return {
        status: 'completed',
        results
      };
    } catch (error) {
      console.error('Translation job failed:', error);
      throw error;
    }
  },
  { 
    connection,
    concurrency: 1 // Process one job at a time
  }
);

// Helper function to process a single page
async function processPage(
  fileData: {
    name: string;
    type: string;
    size: number;
    buffer: string;
  },
  pageNumber: number,
  targetLanguage: string,
  totalPages: number
): Promise<TranslationResult> {
  // Convert base64 back to buffer
  const buffer = Buffer.from(fileData.buffer, 'base64');

  const requestBody = {
    contents: [{
      parts: [{
        text: `Please translate this text to ${targetLanguage} while preserving the original structure, formatting, and meaning. 
               Maintain any special formatting, bullet points, headers, etc.
               
               Text to translate:
               ${fileData.name} - Page ${pageNumber} of ${totalPages}`
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          extracted_text: {
            type: "STRING",
            description: "All text content extracted from the image, preserving original structure"
          },
          translated_text: {
            type: "STRING", 
            description: "Clean translation of the extracted text with no analysis or commentary"
          },
          page_info: {
            type: "OBJECT",
            properties: {
              has_text: { type: "BOOLEAN" },
              content_type: { 
                type: "STRING",
                enum: ["text", "image", "diagram", "table", "mixed"]
              }
            },
            required: ["has_text", "content_type"]
          }
        },
        required: ["extracted_text", "translated_text", "page_info"]
      }
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000)
    }
  );

  if (!response.ok) {
    throw new Error(`Translation failed for page ${pageNumber}: ${response.status}`);
  }

  const result = await response.json();
  const structuredResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!structuredResponse) {
    throw new Error(`No structured response received for page ${pageNumber}`);
  }

  let parsedResult;
  try {
    parsedResult = JSON.parse(structuredResponse);
  } catch (parseError) {
    throw new Error(`Failed to parse structured response for page ${pageNumber}`);
  }

  const { extracted_text, translated_text, page_info } = parsedResult;

  return {
    page_number: pageNumber,
    original_text: extracted_text || '[No text extracted]',
    translated_text: translated_text || '[No translation available]',
    page_image: '', // TODO: Add image processing
    notes: `Processed with structured output - Content: ${page_info?.content_type || 'unknown'}`
  };
}

// Handle worker events
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

// Add method to cancel a job
export const cancelJob = async (jobId: string) => {
  const job = await translationQueue.getJob(jobId);
  if (job) {
    await job.remove();
    return true;
  }
  return false;
};

export { worker }; 