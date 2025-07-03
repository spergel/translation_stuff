import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/lib/auth'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/app/lib/firebase'
import admin from 'firebase-admin'

// TODO: Migrate this API route to use Firestore and Firebase Storage instead of Prisma and Vercel Blob
// Temporarily disabled for Firebase migration

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'pdf' // Default to PDF
    const translationOnly = searchParams.get('translationOnly') === 'true'

    // Get the document from Firestore
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

    // Check if document is completed
    if (document.status !== 'completed') {
      return NextResponse.json({ 
        error: 'Document is not ready for download', 
        status: document.status 
      }, { status: 400 })
    }

    // Initialize Firebase Admin if not already done
    if (admin.apps.length === 0) {
      try {
        admin.initializeApp()
      } catch (error) {
        // App might already be initialized
      }
    }

    try {
      const bucket = admin.storage().bucket()
      
      // Determine file path based on format and type
      let filePath: string
      let contentType: string
      let fileName: string

      if (format === 'pdf') {
        filePath = `users/${session.user.id}/${documentId}/translated${translationOnly ? '_translation' : ''}.pdf`
        contentType = 'application/pdf'
        fileName = `${document.fileName}_${translationOnly ? 'translation' : 'translated'}.pdf`
      } else {
        filePath = `users/${session.user.id}/${documentId}/translated${translationOnly ? '_translation' : ''}.html`
        contentType = 'text/html'
        fileName = `${document.fileName}_${translationOnly ? 'translation' : 'translated'}.html`
      }

      const file = bucket.file(filePath)
      
      // Check if file exists
      const [exists] = await file.exists()
      if (!exists) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      // Get a signed URL for download
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        responseDisposition: `attachment; filename="${fileName}"`,
        responseType: contentType,
      })

      // Redirect to the signed URL for download
      return NextResponse.redirect(signedUrl)

    } catch (storageError) {
      console.error('Error accessing Firebase Storage:', storageError)
      
      // Fallback: try to get the pre-generated download URL from the document
      const downloadUrlField = format === 'pdf' 
        ? (translationOnly ? 'translatedPdfUrl' : 'translatedPdfUrl')
        : (translationOnly ? 'translatedHtmlUrl' : 'translatedHtmlUrl')
      
      if (document[downloadUrlField]) {
        return NextResponse.redirect(document[downloadUrlField])
      }
      
      return NextResponse.json({ error: 'File not accessible' }, { status: 500 })
    }

  } catch (error) {
    console.error('Error processing download:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 