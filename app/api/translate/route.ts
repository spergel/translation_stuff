import { NextRequest, NextResponse } from 'next/server'
import { TranslationResult } from '../../types/translation'
import { initializeServerlessEnvironment } from '../../utils/serverlessPolyfills'
import { getPDFPageCount, processDocumentSmart } from '../../utils/translationProcessor'
import { translationQueue, cancelJob } from '../../lib/queue/config'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/lib/auth'

// Initialize serverless environment
initializeServerlessEnvironment()

interface TranslationResponse {
  document_title: string
  total_pages: number
  target_language: string
  translations: TranslationResult[]
}

export async function POST(req: NextRequest) {
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

    // Get user tier from session, fallback to free for anonymous users
    const userTier = (session?.user?.tier as string) || 'free'

    // Convert File to Buffer for Redis
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Add job to queue
    const job = await translationQueue.add('translate', {
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer: buffer.toString('base64')
      },
      targetLanguage,
      userId: session?.user?.id,
      userTier,
    })

    return NextResponse.json({
      jobId: job.id,
      status: 'queued',
    })
  } catch (error) {
    console.error('Error queueing translation job:', error)
    return NextResponse.json(
      { error: 'Failed to queue translation job' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
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
    const progress = await job.progress
    const result = job.returnvalue

    return NextResponse.json({
      jobId: job.id,
      state,
      progress,
      result,
    })
  } catch (error) {
    console.error('Error getting job status:', error)
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    const success = await cancelJob(jobId)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Job not found or already completed' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      jobId,
      status: 'cancelled'
    })
  } catch (error) {
    console.error('Error cancelling job:', error)
    return NextResponse.json(
      { error: 'Failed to cancel job' },
      { status: 500 }
    )
  }
}