import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';

// Maximum file size (25MB for free tier)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Route segment config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds max for Hobby plan

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Invalid file type. Only PDF files are accepted.' }, { status: 400 });
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.` 
      }, { status: 413 });
    }

    // Generate a unique filename
    const uniqueFilename = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

    // Upload file directly to Vercel Blob
    const blob = await put(uniqueFilename, file, {
      access: 'public',
    });

    console.log(`📄 File "${file.name}" (size: ${file.size} bytes) uploaded to blob: ${blob.url}`);

    return NextResponse.json({
      message: 'File uploaded successfully',
      blobUrl: blob.url,
      originalFilename: file.name,
      fileType: file.type,
      fileSize: file.size,
    });

  } catch (error: any) {
    console.error('❌ Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during file upload.';
    return NextResponse.json(
      { error: `Failed to upload file: ${errorMessage}` },
      { status: 500 }
    );
  }
} 