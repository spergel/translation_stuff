import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions, serializeBigInt } from '@/app/lib/auth'
import { firestoreHelpers } from '@/app/lib/firestore-schema'
import { z } from 'zod'
import { FirebaseStorageManager } from '@/app/utils/firebaseStorage'
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/app/lib/firebase'
import admin from 'firebase-admin'

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
  results: z.array(z.object({
    page_number: z.number(),
    translation: z.string(),
    original_text: z.string(),
    isChapterStart: z.boolean().optional(),
    chapterInfo: z.object({
      page_number: z.number(),
      title: z.string(),
      position: z.enum(['top', 'middle', 'bottom']),
      confidence: z.number(),
    }).optional(),
  })).optional(),
  chaptersDetected: z.number().optional(),
  chaptersProcessedAt: z.date().optional(),
})

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const docRef = doc(db, 'documents', documentId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = docSnap.data()
    
    // Check if user owns this document
    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ 
      document: { 
        id: docSnap.id, 
        ...document,
        createdAt: document.createdAt?.toDate?.()?.toISOString() || document.createdAt,
        updatedAt: document.updatedAt?.toDate?.()?.toISOString() || document.updatedAt,
      } 
    })
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const body = await request.json()
    
    // Validate request body
    const validatedData = updateDocumentSchema.parse(body)

    // Get the document to check ownership
    const docRef = doc(db, 'documents', documentId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = docSnap.data()
    
    // Check if user owns this document
    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Update the document
    await updateDoc(docRef, {
      ...validatedData,
      updatedAt: new Date(),
    })

    // Get updated document
    const updatedDocSnap = await getDoc(docRef)
    const updatedDocument = updatedDocSnap.data()

    return NextResponse.json({ 
      document: { 
        id: updatedDocSnap.id, 
        ...updatedDocument,
        createdAt: updatedDocument?.createdAt?.toDate?.()?.toISOString() || updatedDocument?.createdAt,
        updatedAt: updatedDocument?.updatedAt?.toDate?.()?.toISOString() || updatedDocument?.updatedAt,
      } 
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 })
    }
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const docRef = doc(db, 'documents', documentId)
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const document = docSnap.data()
    
    // Check if user owns this document
    if (document.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete associated files from Firebase Storage
    if (admin.apps.length === 0) {
      // Initialize admin if not already done
      try {
        admin.initializeApp()
      } catch (error) {
        // App might already be initialized
      }
    }

    try {
      const bucket = admin.storage().bucket()
      const userPrefix = `users/${session.user.id}/${documentId}/`
      await bucket.deleteFiles({ prefix: userPrefix })
    } catch (storageError) {
      console.error('Error deleting storage files:', storageError)
      // Continue with Firestore deletion even if storage deletion fails
    }

    // Delete the document from Firestore
    await deleteDoc(docRef)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 