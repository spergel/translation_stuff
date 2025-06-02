import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, serializeBigInt } from '@/app/lib/auth'
import { db } from '@/app/lib/db'
import { z } from 'zod'

// Schema for creating a new document
const createDocumentSchema = z.object({
  originalFilename: z.string(),
  title: z.string(),
  targetLanguage: z.string(),
  originalFileSize: z.number(),
  pageCount: z.number().optional(),
  translationSettings: z.any().optional(),
})

// Schema for updating document
const updateDocumentSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
  progress: z.number().min(0).max(100).optional(),
  pageCount: z.number().optional(),
  translatedPdfUrl: z.string().optional(),
  translatedHtmlUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  processingTimeMs: z.number().optional(),
  tokensUsed: z.number().optional(),
})

// GET /api/documents - Get user's documents
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documents = await db.document.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        folder: {
          select: { name: true, color: true }
        }
      }
    })

    return NextResponse.json({ documents: serializeBigInt(documents) })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/documents - Create a new document
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = createDocumentSchema.parse(body)

    // Check storage limits before creating document
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { 
        tier: true, 
        storageUsedBytes: true, 
        documentsCount: true 
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Define tier limits
    const tierLimits = {
      free: { maxDocuments: 5, maxStorageBytes: 5 * 1024 * 1024 * 1024 }, // 5GB
      basic: { maxDocuments: 50, maxStorageBytes: 5 * 1024 * 1024 * 1024 }, // 5GB
      pro: { maxDocuments: 500, maxStorageBytes: 25 * 1024 * 1024 * 1024 }, // 25GB
      enterprise: { maxDocuments: Infinity, maxStorageBytes: 50 * 1024 * 1024 * 1024 }, // 50GB
    }

    const limits = tierLimits[user.tier as keyof typeof tierLimits] || tierLimits.free

    // Check document count limit
    if (user.documentsCount >= limits.maxDocuments) {
      return NextResponse.json({ 
        error: `Document limit reached. ${user.tier} tier allows ${limits.maxDocuments} documents.`,
        code: 'DOCUMENT_LIMIT_EXCEEDED'
      }, { status: 403 })
    }

    // Check storage limit
    const newStorageUsed = Number(user.storageUsedBytes) + data.originalFileSize
    if (newStorageUsed > limits.maxStorageBytes) {
      const limitMB = Math.round(limits.maxStorageBytes / (1024 * 1024))
      const usedMB = Math.round(Number(user.storageUsedBytes) / (1024 * 1024))
      const fileSizeMB = Math.round(data.originalFileSize / (1024 * 1024))
      
      return NextResponse.json({ 
        error: `Storage limit exceeded. ${user.tier} tier allows ${limitMB}MB. Used: ${usedMB}MB, File: ${fileSizeMB}MB`,
        code: 'STORAGE_LIMIT_EXCEEDED'
      }, { status: 403 })
    }

    // Create the document
    const document = await db.document.create({
      data: {
        userId: session.user.id,
        originalFilename: data.originalFilename,
        title: data.title,
        targetLanguage: data.targetLanguage,
        originalFileSize: BigInt(data.originalFileSize),
        pageCount: data.pageCount,
        translationSettings: data.translationSettings,
        status: 'queued',
        progress: 0,
      }
    })

    // Update user document count and storage usage
    await db.user.update({
      where: { id: session.user.id },
      data: {
        documentsCount: { increment: 1 },
        storageUsedBytes: { increment: BigInt(data.originalFileSize) }
      }
    })

    return NextResponse.json({ document: serializeBigInt(document) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 })
    }
    
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/documents/[id] - Update document
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const pathSegments = url.pathname.split('/')
    const documentId = pathSegments[pathSegments.length - 1]

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    const body = await request.json()
    const data = updateDocumentSchema.parse(body)

    // Verify document belongs to user
    const existingDocument = await db.document.findFirst({
      where: { 
        id: documentId,
        userId: session.user.id 
      }
    })

    if (!existingDocument) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Update the document
    const updatedDocument = await db.document.update({
      where: { id: documentId },
      data: {
        ...data,
        updatedAt: new Date(),
        ...(data.status === 'completed' && { completedAt: new Date() })
      }
    })

    return NextResponse.json({ document: serializeBigInt(updatedDocument) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 })
    }
    
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 