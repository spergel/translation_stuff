import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/lib/auth'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/app/lib/firebase'
import { z } from 'zod'

// Schema for creating a new document
const createDocumentSchema = z.object({
  originalFilename: z.string(),
  title: z.string(),
  targetLanguage: z.string(),
  originalFileSize: z.number(),
  translationSettings: z.object({
    extractImages: z.boolean().optional(),
    userTier: z.string(),
  }).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Validate request body
    const validatedData = createDocumentSchema.parse(body)

    // Create document in Firestore
    const docRef = await addDoc(collection(db, 'documents'), {
      userId: session.user.id,
      originalFilename: validatedData.originalFilename,
      title: validatedData.title,
      targetLanguage: validatedData.targetLanguage,
      originalFileSize: validatedData.originalFileSize,
      translationSettings: validatedData.translationSettings,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log('Created document:', docRef.id)

    return NextResponse.json({ 
      document: { 
        id: docRef.id,
        ...validatedData,
        userId: session.user.id,
        status: 'pending',
        progress: 0,
      } 
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.errors }, { status: 400 })
    }
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // TODO: Implement listing user's documents
    return NextResponse.json({ documents: [] })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 