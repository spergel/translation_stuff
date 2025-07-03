import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/lib/auth'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/app/lib/firebase'
import { detectChaptersWithAI } from '@/app/utils/chapterDetection'
import { TranslationResult } from '@/app/types/translation'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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

    // Check if document is completed and has results
    if (document.status !== 'completed' || !document.results) {
      return NextResponse.json({ 
        error: 'Document must be completed and have translation results', 
        status: document.status 
      }, { status: 400 })
    }

    // Check if user is paid (has userTier other than 'free')
    const userTier = document.translationSettings?.userTier || 'free'
    if (userTier === 'free') {
      return NextResponse.json({ 
        error: 'Chapter detection is only available for paid users' 
      }, { status: 403 })
    }

    console.log('🔍 Starting chapter detection for document:', documentId, 'userTier:', userTier)

    // Run chapter detection
    const results: TranslationResult[] = document.results
    const updatedResults = await detectChaptersWithAI(results, document.targetLanguage)

    // Count detected chapters
    const chaptersDetected = updatedResults.filter(r => r.isChapterStart).length

    // Update the document with chapter information
    await updateDoc(docRef, {
      results: updatedResults,
      chaptersDetected,
      chaptersProcessedAt: new Date(),
      updatedAt: new Date(),
    })

    console.log('✅ Chapter detection complete for document:', documentId, 'chapters:', chaptersDetected)

    return NextResponse.json({ 
      success: true,
      chaptersDetected,
      message: `Successfully detected ${chaptersDetected} chapters`
    })

  } catch (error) {
    console.error('❌ Error in chapter detection:', error)
    return NextResponse.json({ 
      error: 'Chapter detection failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 