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
    if (state === 'completed' || state === 'failed' || state === 'cancelled') {
      return NextResponse.json({ error: `Job is already ${state}, cannot cancel.` }, { status: 409 }) // 409 Conflict
    }

    // Attempt to remove the job if it's active or waiting
    // Forcibly remove if it's stuck (use with caution for active jobs)
    if (job.remove && (state === 'active' || state === 'waiting' || state === 'delayed')) {
      await job.remove() //This will also try to move the job to failed with a JobCancellation error if it's active.
      console.log(`🗑️ API Route (DELETE): Job ${jobId} removed (or cancellation initiated).`)
      return NextResponse.json({ jobId, status: 'cancelled' })
    } else if (job.moveToFailed && state === 'active') { // If remove is not available or to be more graceful with active jobs
      await job.moveToFailed(new Error('Job cancelled by user via API'), 'user-cancelled', true)
      console.log(`🚫 API Route (DELETE): Job ${jobId} marked as failed (cancelled by user).`)
      return NextResponse.json({ jobId, status: 'cancelled' })
    } else {
      console.warn(`⚠️ API Route (DELETE): Job ${jobId} in state ${state} could not be directly removed or marked failed as cancelled.`)
      return NextResponse.json({ error: `Job in state ${state} could not be cancelled through this action.` }, { status: 400 })
    }

  } catch (error: any) {
    console.error('❌ API Route (DELETE): Error cancelling job:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error.'
    return NextResponse.json({ error: `Failed to cancel job: ${errorMessage}` }, { status: 500 })
  }
}