import { NextRequest, NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'
import { put } from '@vercel/blob';
import fs from 'fs/promises'; // To read the temporary file
import path from 'path'; // To construct a blob filename

// Initialize serverless environment polyfills if they were for API route specific needs (e.g. if not using Vercel)
// initializeServerlessEnvironment()

const redisConnectionString = process.env.REDIS_CONNECTION_STRING
if (!redisConnectionString) {
  console.error('❌ API Route: REDIS_CONNECTION_STRING is not defined. Queue cannot be accessed.')
  // This will cause issues, ensure it's set
}

const connection = redisConnectionString ? new IORedis(redisConnectionString, {
  tls: {
    rejectUnauthorized: false // Adjust as per your Redis security settings
  },
  maxRetriesPerRequest: null, // Retry indefinitely
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 5000) // Max 5s delay
    console.log(`🔄 API Route: Retrying Redis connection, attempt ${times}, delay ${delay}ms`)
    return delay
  }
}) : null

const translationQueue = connection ? new Queue('translation-jobs', { connection }) : null

if (connection) {
  connection.on('connect', () => console.log('🔗 API Route: Redis connected for translate API'))
  connection.on('error', (err) => console.error('❌ API Route: Redis connection error:', err))
}

export async function POST(req: NextRequest) {
  if (!translationQueue) {
    console.error('❌ API Route: Translation queue is not initialized. Check Redis connection.')
    return NextResponse.json({ error: 'Translation service is currently unavailable. Please try again later.' }, { status: 503 })
  }

  try {
    const session = await getServerSession(authOptions)
    // Expect JSON body now instead of FormData
    // This tempFilePath is assumed to be created by an earlier step or Vercel's runtime
    // if this API route itself handles direct file uploads (e.g. from FormData).
    // If so, you might need to adjust how 'fileBuffer' is obtained.
    const body = await req.json();
    const { tempFilePath, originalFilename, fileType, fileSize, targetLanguage } = body;

    if (!tempFilePath || !originalFilename || !fileType || fileSize === undefined || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing required fields: tempFilePath, originalFilename, fileType, fileSize, targetLanguage' },
        { status: 400 }
      )
    }

    // --- Validate Filename ---
    const validFilenameRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!validFilenameRegex.test(originalFilename)) {
      console.warn(`❌ API Route: Invalid filename received: "${originalFilename}". User ID: ${session?.user?.id || 'anonymous'}`);
      return NextResponse.json(
        { error: 'Invalid filename. Please use only English letters, numbers, underscores, hyphens, and periods (e.g., my_document-1.pdf).' },
        { status: 400 }
      );
    }
    // --- End Validate Filename ---

    if (fileType !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are accepted.' },
        { status: 400 }
      )
    }

    // --- Upload to Vercel Blob ---
    let blobUrl = '';
    try {
      console.log(`Attempting to read file from tempFilePath for blob upload: ${tempFilePath}`);
      const fileBuffer = await fs.readFile(tempFilePath);
      // Sanitize filename for the blob path, and ensure it's unique enough or organized
      const blobFilename = `pdf-uploads/${Date.now()}-${path.basename(originalFilename)}`;
      
      const blob = await put(blobFilename, fileBuffer, {
        access: 'public', // Or 'private' if your worker can be authenticated
        contentType: fileType,
        // Add any cache control headers if necessary
        // cacheControlMaxAge: 3600, 
      });
      blobUrl = blob.url;
      console.log(`✅ File uploaded to Vercel Blob: ${blobUrl}`);

      // Optionally, delete the local temporary file if it's no longer needed
      // await fs.unlink(tempFilePath);
      // console.log(`🗑️ Deleted local temporary file: ${tempFilePath}`);

    } catch (uploadError: any) {
      console.error('❌ API Route: Error uploading file to Vercel Blob:', uploadError);
      return NextResponse.json(
        { error: `Failed to store file for translation: ${uploadError.message}` },
        { status: 500 }
      );
    }
    // --- End Upload to Vercel Blob ---

    const userTier = (session?.user?.tier as string) || 'free'
    const userId = session?.user?.id

    // REMOVED OLD PATH TRANSFORMATION LOGIC

    const jobName = `pdf-translate-${originalFilename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
    const jobData = {
      file: { 
        name: originalFilename,
        type: fileType,
        size: fileSize, // This size is from the original upload, blob might have slightly different stored size.
      },
      blobUrl: blobUrl, // Use the Vercel Blob URL
      targetLanguage,
      userId,
      userTier,
    }

    const job = await translationQueue.add(jobName, jobData, {
      // Optional: configure retries
    })

    // Log the original tempFilePath for context, but worker will use blobUrl
    console.log(`✅ Job ${job.id} (name: ${jobName}) for PDF "${originalFilename}" (using blob URL: ${blobUrl}, original temp path: ${tempFilePath}) enqueued by user ${userId || 'anonymous'}.`)

    return NextResponse.json({
      message: `Translation job for "${originalFilename}" has been queued successfully.`,
      jobId: job.id,
      status: 'queued',
    }, { status: 202 })

  } catch (error: any) {
    console.error('❌ API Route: Error queueing PDF translation job:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred.'
    if (error.message && (error.message.includes('ECONNREFUSED') || error.message.toLowerCase().includes('redis'))) {
      console.error('❌🔴 API Route: Critical Redis connection error during job queuing:', error.message)
      return NextResponse.json({ error: 'Failed to connect to translation service. Please try again later.' }, { status: 503 })
    }
    return NextResponse.json(
      { error: `Failed to queue translation job: ${errorMessage}` },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  if (!translationQueue) {
    console.error('❌ API Route (GET): Translation queue is not initialized.')
    return NextResponse.json({ error: 'Translation service status cannot be determined.' }, { status: 503 })
  }
            try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    const job = await translationQueue.getJob(jobId)
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    const state = await job.getState()
    const progress = job.progress // progress is a number
    const result = job.returnvalue // This will be TranslationResult[] upon completion
    const failedReason = job.failedReason

    // Add a check for job.data to ensure it matches the new structure if needed for response
    // For example, you might want to return some non-sensitive parts of job.data
    // const jobInfo = { ...job.data }; // Be careful about exposing tempFilePath directly
    // delete jobInfo.tempFilePath; 

    console.log(`🔍 API Route (GET): Status for job ${jobId}: ${state}, progress: ${progress}`)

    return NextResponse.json({
      jobId: job.id,
      jobName: job.name,
      state,
      progress,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      result, 
      failedReason,
      // data: jobInfo // Example if you want to return parts of the job data
    })
  } catch (error: any) {
    console.error('❌ API Route (GET): Error getting job status:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error.'
    return NextResponse.json(
      { error: `Failed to get job status: ${errorMessage}` },
      { status: 500 }
    )
  }
}

// DELETE function for cancelling jobs (can remain similar, ensure cancelJob works with BullMQ)
// Assuming cancelJob is defined in lib/queue/config.ts and is compatible
import { cancelJob } from '@/app/lib/queue/config' // Adjust path as needed

export async function DELETE(req: NextRequest) {
  if (!translationQueue) {
    console.error('❌ API Route (DELETE): Translation queue is not initialized.')
    return NextResponse.json({ error: 'Cannot cancel job, service unavailable.' }, { status: 503 })
  }
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required for cancellation' }, { status: 400 })
    }

    const job = await translationQueue.getJob(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found, cannot cancel.' }, { status: 404 })
    }

    const state = await job.getState()
    const isActive = state === 'active';
    const isWaiting = state === 'waiting' || state === 'delayed' || state === 'paused'; // Paused jobs can also be removed

    if (state === 'completed' || state === 'failed' || state === 'cancelled') {
      return NextResponse.json({ message: `Job is already ${state}, cannot cancel.`, status: state }, { status: 409 }); // 409 Conflict
    }

    if (isWaiting) {
      try {
        await job.remove();
        console.log(`🗑️ API Route (DELETE): Waiting/Delayed/Paused Job ${jobId} removed successfully.`);
        return NextResponse.json({ jobId, status: 'cancelled', message: 'Job was waiting and has been removed.' });
      } catch (removeError: any) {
        console.error(`❌ API Route (DELETE): Error removing waiting/delayed job ${jobId}:`, removeError.message);
        // If remove failed for some unexpected reason, try to mark as failed.
        await job.moveToFailed(new Error('Job cancellation attempted (was waiting, remove failed). User: ' + (await getServerSession(authOptions))?.user?.id), 'cancelled-by-user-admin-failure');
        return NextResponse.json({ error: `Job was waiting but could not be removed directly. Marked as failed: ${removeError.message}` }, { status: 500 });
      }
    } else if (isActive) {
      // For active jobs, attempting to move to failed with a specific reason is usually safer
      // than forceful removal, as the worker can pick up the isActive() check.
      try {
        await job.moveToFailed(new Error('Job cancelled by user via API while active.'), 'cancelled-by-user-active', false); // false for keepJobs
        console.log(`🚫 API Route (DELETE): Active Job ${jobId} marked as failed (cancelled by user). Worker should stop processing.`);
        return NextResponse.json({ jobId, status: 'cancelling', message: 'Job is active. Cancellation requested. Worker will attempt to stop.' });
      } catch (moveToFailedError: any) {
        console.error(`❌ API Route (DELETE): Error marking active job ${jobId} as failed:`, moveToFailedError.message);
        // This can happen if the job is locked and moveToFailed also has issues, though less common than remove().
        return NextResponse.json({ error: `Job is active and could not be marked as cancelled: ${moveToFailedError.message}. It might be locked.` }, { status: 500 });
      }
    } else {
      // Should ideally not reach here if previous state checks are comprehensive
      console.warn(`⚠️ API Route (DELETE): Job ${jobId} in state ${state} - no standard cancellation path taken.`);
      return NextResponse.json({ error: `Job in state ${state} could not be cancelled through standard actions.` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('❌ API Route (DELETE): General error cancelling job:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error.';
    return NextResponse.json({ error: `Failed to process cancellation request: ${errorMessage}` }, { status: 500 });
  }
}