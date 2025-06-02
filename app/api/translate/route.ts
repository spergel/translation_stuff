import { NextRequest, NextResponse } from 'next/server'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'

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
    const formData = await req.formData()
    const file = formData.get('file') as File
    const targetLanguage = formData.get('targetLanguage') as string

    if (!file || !targetLanguage) {
      return NextResponse.json(
        { error: 'File and target language are required' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are accepted.' },
        { status: 400 }
      )
    }

    // Get user tier from session, fallback to free for anonymous users
    const userTier = (session?.user?.tier as string) || 'free'
    const userId = session?.user?.id

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Pdf = buffer.toString('base64')

    const jobName = `pdf-translate-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`
    const jobData = {
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer: base64Pdf // Send base64 encoded PDF to worker
      },
      targetLanguage,
      userId,
      userTier,
    }

    const job = await translationQueue.add(jobName, jobData, {
      // attempts: 3, // Optional: configure retries at the queue level if desired
      // backoff: { type: 'exponential', delay: 5000 }
    })

    console.log(`✅ Job ${job.id} (name: ${jobName}) for PDF "${file.name}" enqueued by user ${userId || 'anonymous'}.`)

    return NextResponse.json({
      message: `Translation job for "${file.name}" has been queued successfully.`,
      jobId: job.id,
      status: 'queued', // Initial status
    }, { status: 202 }) // 202 Accepted

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

    console.log(`🔍 API Route (GET): Status for job ${jobId}: ${state}, progress: ${progress}`)

    return NextResponse.json({
      jobId: job.id,
      jobName: job.name,
      state,
      progress,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      result, // Contains the array of TranslationResult if completed
      failedReason,
      // You might want to include job.data here for debugging but be careful with sensitive info
      // data: job.data 
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