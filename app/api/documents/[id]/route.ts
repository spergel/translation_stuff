import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, serializeBigInt } from '@/app/lib/auth'
import { db } from '@/app/lib/db'
import { z } from 'zod'
import FileStorageManager from '@/app/utils/fileStorage'

// Schema for updating document
const updateDocumentSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
  progress: z.number().min(0).max(100).optional(),
  pageCount: z.number().optional(),
  originalFileUrl: z.string().optional(),
  translatedPdfUrl: z.string().optional(),
  translatedHtmlUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  processingTimeMs: z.number().optional(),
  tokensUsed: z.number().optional(),
})

// PUT /api/documents/[id] - Update document
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id

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

// DELETE /api/documents/[id] - Delete document
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    // Verify document belongs to user and get file size for storage cleanup
    const existingDocument = await db.document.findFirst({
      where: { 
        id: documentId,
        userId: session.user.id 
      },
      select: {
        id: true,
        originalFileSize: true,
      }
    })

    if (!existingDocument) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete files from Vercel Blob storage
    try {
      await FileStorageManager.deleteDocumentFiles(session.user.id, documentId)
      console.log(`🗑️ Deleted blob files for document ${documentId}`)
    } catch (storageError) {
      console.error('Failed to delete files from blob storage:', storageError)
      // Continue with database deletion even if blob deletion fails
    }

    // Delete document from database
    await db.document.delete({
      where: { id: documentId }
    })

    // Update user document count and storage usage
    await db.user.update({
      where: { id: session.user.id },
      data: {
        documentsCount: { decrement: 1 },
        storageUsedBytes: { decrement: existingDocument.originalFileSize }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 