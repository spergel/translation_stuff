import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'
import { PrismaClient } from '../../../../../generated/prisma'
import { head } from '@vercel/blob'

const prisma = new PrismaClient()

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documentId = params.id
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') // 'pdf' or 'html'

    if (!format || !['pdf', 'html'].includes(format)) {
      return NextResponse.json({ error: 'Invalid format. Must be pdf or html' }, { status: 400 })
    }

    // Find the document and verify ownership
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        user: {
          email: session.user.email
        }
      }
    })

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (document.status !== 'completed') {
      return NextResponse.json({ error: 'Document not ready for download' }, { status: 400 })
    }

    // Get the appropriate file URL
    const fileUrl = format === 'pdf' ? document.translatedPdfUrl : document.translatedHtmlUrl

    if (!fileUrl) {
      return NextResponse.json({ 
        error: `${format.toUpperCase()} file not available for this document` 
      }, { status: 404 })
    }

    // Verify the file exists in Vercel Blob
    try {
      await head(fileUrl)
    } catch (error) {
      console.error('File not found in blob storage:', error)
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
    }

    // Return a redirect to the file URL for direct download
    // The file URL from Vercel Blob is already secure and has access controls
    return NextResponse.redirect(fileUrl)

  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
} 