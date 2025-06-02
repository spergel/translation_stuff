import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = '/tmp/pdf-uploads'; // Temporary directory on the server

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`✅ Temporary upload directory created: ${UPLOAD_DIR}`);
  } catch (error) {
    console.error(`❌ Failed to create temporary upload directory ${UPLOAD_DIR}:`, error);
    // Depending on the setup, you might want to throw an error here to prevent the app from starting
    // or handle it by trying an alternative path.
  }
}

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

    // Generate a unique filename to prevent collisions
    const uniqueFilename = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
    const tempFilePath = path.join(UPLOAD_DIR, uniqueFilename);

    // Convert ArrayBuffer to Buffer and write to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await fs.promises.writeFile(tempFilePath, buffer);

    console.log(`📄 File "${file.name}" (size: ${file.size} bytes) uploaded temporarily to: ${tempFilePath}`);

    return NextResponse.json({
      message: 'File uploaded temporarily successfully',
      tempFilePath,
      originalFilename: file.name,
      fileType: file.type,
      fileSize: file.size,
    }, { status: 200 });

  } catch (error: any) {
    console.error('❌ Error uploading temporary file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during temporary file upload.';
    return NextResponse.json(
      { error: `Failed to upload temporary file: ${errorMessage}` },
      { status: 500 }
    );
  }
} 