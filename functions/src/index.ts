import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranslationResult } from '../../app/types/translation';
import { generateHTML } from './htmlGenerators';
import { detectChaptersWithAI } from './chapterDetection';
import { generateEpubContent, generateSimpleEpubHTML } from './epubGeneration';

admin.initializeApp();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(functions.config().gemini?.api_key || process.env.GOOGLE_API_KEY || '');

// Language mapping for AI prompts
const LANGUAGE_NAMES = {
  'english': 'English',
  'spanish': 'Spanish', 
  'french': 'French',
  'german': 'German',
  'italian': 'Italian',
  'portuguese': 'Portuguese',
  'russian': 'Russian',
  'chinese': 'Chinese (Simplified)',
  'japanese': 'Japanese',
  'korean': 'Korean'
} as const;

// Step 1: Extract text from image (transcription only)
async function extractTextFromImage(imageBase64: string): Promise<string> {
  try {
    console.log('📝 Starting text extraction from image');
    console.log('🖼️ Image size:', `${(imageBase64.length / 1024).toFixed(1)} KB`);
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Please extract ALL visible text from this image exactly as it appears.

Instructions:
- Extract text precisely without any translation or modification
- Maintain the original structure, formatting, and language
- Preserve paragraph breaks, bullet points, and spacing
- Keep ALL technical terms, proper nouns, citations, and special characters exactly as written
- If there are tables, charts, or diagrams, extract any text within them
- If the image contains no readable text, respond with "[No readable text found in this image]"

Please provide the extracted text exactly as it appears in the original:`;
    
    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: "image/jpeg"
      }
    };
    
    console.log('📤 Extracting text with Gemini Vision API...');
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const extractedText = response.text();
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text extracted from image');
    }
    
    console.log('✅ Text extraction completed, length:', extractedText.length);
    return extractedText.trim();
    
  } catch (error) {
    console.error('❌ Text extraction error:', error);
    throw new Error(`Text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Step 2: Translate extracted text
async function translateText(text: string, targetLanguage: string): Promise<string> {
  try {
    console.log('🌍 Starting text translation to:', targetLanguage);
    console.log('📝 Text length:', text.length, 'characters');
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Please translate the following text to ${targetLanguage}.

Instructions:
- Translate ALL the provided text to ${targetLanguage}
- Maintain the original structure and formatting as much as possible
- Preserve paragraph breaks, bullet points, and spacing
- Keep technical terms, proper nouns, and citations if they don't have common translations
- Provide natural, fluent translation while staying faithful to the original meaning
- If any part cannot be translated, keep it in the original language

Text to translate:

${text}`;
    
    console.log('📤 Translating text with Gemini API...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translation = response.text();
    
    if (!translation || translation.trim().length === 0) {
      throw new Error('Empty translation received from AI service');
    }
    
    console.log('✅ Text translation completed, length:', translation.length);
    return translation.trim();
    
  } catch (error) {
    console.error('❌ Text translation error:', error);
    throw new Error(`Text translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Note: splitTextIntoPages function is no longer needed since we're processing images directly

const puppeteerOptions = {
    timeoutSeconds: 300,
    memory: '1GB' as const,
};

export const userCreated = functions.auth.user().onCreate(async (user: functions.auth.UserRecord) => {
  try {
    console.log(`Creating user document for: ${user.email || user.uid}`);
    await admin.firestore().collection('users').doc(user.uid).set({
      id: user.uid,
      email: user.email,
      name: user.displayName,
      image: user.photoURL,
      tier: 'free',
      isEduEmail: user.email?.endsWith('.edu') || false,
      storageUsedBytes: 0,
      documentsCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Successfully created user document for: ${user.email || user.uid}`);
  } catch (error) {
    console.error(`Error creating user document for ${user.email || user.uid}:`, error);
  }
});

export const userDeleted = functions.auth.user().onDelete(async (user: functions.auth.UserRecord) => {
  const uid = user.uid;
  try {
    console.log(`Cleaning up data for deleted user: ${uid}`);
    
    // Delete user's documents from Storage
    const bucket = admin.storage().bucket();
    const prefix = `users/${uid}/`;
    await bucket.deleteFiles({ prefix });
    console.log(`Deleted storage files for user ${uid}`);

    // Delete user's documents from Firestore
    const userDocsQuery = admin.firestore().collection('documents').where('userId', '==', uid);
    const userDocsSnap = await userDocsQuery.get();

    const batch = admin.firestore().batch();
    userDocsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Deleted ${userDocsSnap.size} firestore documents for user ${uid}`);

    // Delete user document
    await admin.firestore().collection('users').doc(uid).delete();
    console.log(`Deleted user document for ${uid}`);

  } catch (error) {
    console.error(`Error cleaning up data for user ${uid}:`, error);
  }
});

// NEW: Unified HTTP function for both anonymous and authenticated users
export const translateDocument = functions.runWith(puppeteerOptions).https.onRequest(async (req, res) => {
  const startTime = Date.now();
  
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('🚀 Unified translation function called at:', new Date().toISOString());
    
    const { pageImages, fileName, targetLanguage, userTier, userId, batchInfo } = req.body;

    console.log('📋 Request details:', {
      fileName,
      targetLanguage,
      userTier,
      userId: userId ? 'authenticated' : 'anonymous',
      pagesCount: pageImages?.length || 0,
      batchInfo: batchInfo || 'single request',
      timestamp: new Date().toISOString()
    });

    // Validate required fields
    if (!pageImages || !Array.isArray(pageImages) || pageImages.length === 0 || !fileName || !targetLanguage) {
      console.error('❌ Missing required fields');
      res.status(400).json({ 
        error: 'Missing required fields: pageImages (array), fileName, targetLanguage' 
      });
      return;
    }

    // Check if we have the API key
    const apiKey = functions.config().gemini?.api_key;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY not configured');
      res.status(500).json({
        error: 'Translation service not properly configured'
      });
      return;
    }

    console.log('🔄 Starting unified PDF translation process...');
    
    // For authenticated users, create a Firestore document first for tracking
    let documentRef: admin.firestore.DocumentReference | null = null;
    
    if (userId) {
      console.log('👤 Creating Firestore document for authenticated user tracking...');
      documentRef = await admin.firestore().collection('documents').add({
        userId,
        fileName,
        targetLanguage,
        userTier,
        status: 'processing',
        progress: 10,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('📄 Created tracking document:', documentRef.id);
    }

    // Progress callback that updates Firestore for authenticated users
    const onProgress = async (progress: number, message: string) => {
      console.log(`📈 Progress: ${progress}% - ${message}`);
      if (documentRef) {
        await documentRef.update({ progress, statusMessage: message, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    };

    // Process the images directly (no PDF conversion needed)
    const results = await processImagesForTranslation(pageImages, fileName, targetLanguage, onProgress, batchInfo);
    
    const processingTime = Date.now() - startTime;
    
    console.log('🎉 Translation completed successfully!', {
      fileName,
      targetLanguage,
      pagesTranslated: results.length,
      processingTimeMs: processingTime,
      processingTimeSeconds: (processingTime / 1000).toFixed(1),
      userId: userId ? 'authenticated' : 'anonymous'
    });

    // For authenticated users, save results to Firestore and Storage
    if (userId && documentRef) {
      console.log('💾 Saving results for authenticated user...');
      
      // Generate HTML
      const html = generateHTML(results, fileName);
      
      // Save to Firebase Storage
      const bucket = admin.storage().bucket();
      const filePath = `users/${userId}/${documentRef.id}/translated.html`;
      const file = bucket.file(filePath);
      
      await file.save(Buffer.from(html, 'utf-8'), {
        metadata: { contentType: 'text/html' },
      });
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491',
      });

      // Update Firestore with final results
      await documentRef.update({
        status: 'completed',
        progress: 100,
        statusMessage: 'Translation complete.',
        results: results,
        translatedFileUrl: signedUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Results saved for authenticated user');
    }

    // Return results to client
    res.json({ 
      success: true,
      results: results,
      message: `Translation completed: ${results.length} pages processed in ${(processingTime / 1000).toFixed(1)}s`,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
      documentId: documentRef?.id || null
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    console.error('💥 Translation function error:', error);
    console.error('🔍 Error occurred after:', `${(processingTime / 1000).toFixed(1)}s`);
    
    res.status(500).json({ 
      error: 'Translation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    });
  }
});

// Process images directly for translation (no PDF conversion needed)
async function processImagesForTranslation(
  pageImages: string[], 
  fileName: string,
  targetLanguage: string, 
  onProgress: (progress: number, message: string) => Promise<void>,
  batchInfo?: { batchIndex: number, totalBatches: number, startPage: number, endPage: number, totalPages: number }
): Promise<TranslationResult[]> {
  try {
    console.log('🖼️ Starting image translation for:', fileName);
    await onProgress(35, 'Starting AI translation...');
    
    const totalPages = pageImages.length;
    console.log(`📄 Processing ${totalPages} pages for translation`);
    
    const results: TranslationResult[] = [];
    const targetLangName = LANGUAGE_NAMES[targetLanguage as keyof typeof LANGUAGE_NAMES] || 'English';
    console.log('🌍 Target language:', targetLangName);
    
    // Translate each page image
    for (let i = 0; i < pageImages.length; i++) {
      const pageNum = batchInfo ? batchInfo.startPage + i : i + 1;
      const totalDocPages = batchInfo ? batchInfo.totalPages : totalPages;
      const imageBase64 = pageImages[i];
      
      console.log(`📄 Processing page ${pageNum} of ${totalDocPages}...`);
      await onProgress(
        35 + (55 * i / pageImages.length), 
        `Translating page ${pageNum} of ${totalDocPages}...`
      );
              
      try {
        // Step 1: Extract text from image
        console.log(`📝 Extracting text from page ${pageNum}...`);
        const extractedText = await extractTextFromImage(imageBase64);
        console.log(`✅ Text extraction completed for page ${pageNum}, length: ${extractedText.length} chars`);
        
        // Step 2: Translate the extracted text
        console.log(`🌍 Translating page ${pageNum} to ${targetLangName}...`);
        const translation = await translateText(extractedText, targetLangName);
        console.log(`✅ Translation completed for page ${pageNum}, length: ${translation.length} chars`);
        
        results.push({
          page_number: pageNum,
          original_text: extractedText,
          translation: translation,
        });
        
        console.log(`📋 Added result for page ${pageNum} to results array`);
        
      } catch (processError) {
        console.error(`❌ Error processing page ${pageNum}:`, processError);
        // Add error result but continue
        results.push({
          page_number: pageNum,
          original_text: `[Text Extraction Error: ${processError instanceof Error ? processError.message : 'Unknown error'}]`,
          translation: `[Translation Error: Could not process page due to extraction failure]`,
        });
        console.log(`⚠️ Added error result for page ${pageNum}`);
      }
    }
    
    console.log('🎉 Translation loop completed!', {
      totalPages,
      successfulPages: results.filter(r => !r.translation.includes('[Translation Error')).length,
      errorPages: results.filter(r => r.translation.includes('[Translation Error')).length
    });
    
    await onProgress(90, 'Translation complete!');
    return results;
    
  } catch (error) {
    console.error('💥 Error in image translation:', error);
    throw error;
  }
}

// Scheduled function to delete old documents and their files (older than 30 days)
export const autoDeleteOldDocuments = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const now = Date.now();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    // Query all documents
    const docsSnap = await db.collection('documents').get();
    for (const doc of docsSnap.docs) {
      const data = doc.data();
      const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt?._seconds ? data.createdAt._seconds * 1000 : null);
      const completedAt = data.completedAt?.toMillis ? data.completedAt.toMillis() : (data.completedAt?._seconds ? data.completedAt._seconds * 1000 : null);
      const timestamp = completedAt || createdAt;
      if (!timestamp) continue;
      if (now - timestamp > THIRTY_DAYS_MS) {
        // Delete all files in users/{userId}/{docId}/
        if (data.userId && doc.id) {
          const prefix = `users/${data.userId}/${doc.id}/`;
          const [files] = await bucket.getFiles({ prefix });
          await Promise.all(files.map(file => file.delete()));
        }
        // Delete Firestore document
        await doc.ref.delete();
        deletedCount++;
      }
    }
    console.log(`Auto-delete: Deleted ${deletedCount} old documents and their files.`);
    return null;
  });

// Chapter Detection Function
export const detectDocumentChapters = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { documentId } = data;
  
  if (!documentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Document ID is required');
  }

  try {
    console.log('🔍 Starting chapter detection for document:', documentId);
    
    // Get document from Firestore
    const docRef = admin.firestore().collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }
    
    const document = docSnap.data()!;
    
    // Verify ownership
    if (document.userId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }
    
    // Check if document is completed and has results
    if (document.status !== 'completed' || !document.results) {
      throw new functions.https.HttpsError('failed-precondition', 'Document must be completed with results');
    }
    
    // Check if user is paid
    const userTier = document.translationSettings?.userTier || 'free';
    if (userTier === 'free') {
      throw new functions.https.HttpsError('permission-denied', 'Chapter detection is only available for paid users');
    }
    
    console.log('📖 Running chapter detection...');
    
    // Run chapter detection
    const results = document.results;
    const updatedResults = await detectChaptersWithAI(results, document.targetLanguage);
    
    // Count detected chapters
    const chaptersDetected = updatedResults.filter((r: any) => r.isChapterStart).length;
    
    // Update document with chapter information
    await docRef.update({
      results: updatedResults,
      chaptersDetected,
      chaptersProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log('✅ Chapter detection complete:', chaptersDetected, 'chapters found');
    
    return {
      success: true,
      chaptersDetected,
      message: `Successfully detected ${chaptersDetected} chapters`
    };
    
  } catch (error) {
    console.error('❌ Chapter detection error:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Chapter detection failed');
  }
});

// EPUB Generation Function  
export const generateDocumentEpub = functions.runWith({
  timeoutSeconds: 300,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { documentId } = data;
  
  if (!documentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Document ID is required');
  }

  try {
    console.log('📚 Starting EPUB generation for document:', documentId);
    
    // Get document from Firestore
    const docRef = admin.firestore().collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Document not found');
    }
    
    const document = docSnap.data()!;
    
    // Verify ownership
    if (document.userId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }
    
    // Check if document is completed and has results
    if (document.status !== 'completed' || !document.results) {
      throw new functions.https.HttpsError('failed-precondition', 'Document must be completed with results');
    }
    
    console.log('📖 Generating EPUB content...');
    
    const results = document.results;
    const bookTitle = document.title || document.originalFilename?.replace(/\.pdf$/i, '') || 'Translated Document';
    
    // Generate EPUB content with chapters
    const { chapters, metadata } = await generateEpubContent({
      results,
      bookTitle,
      targetLanguage: document.targetLanguage || 'english',
      originalFilename: document.originalFilename || 'document.pdf',
      userId: context.auth.uid
    });
    
    // Generate simple HTML version
    const htmlContent = generateSimpleEpubHTML(chapters, metadata);
    
    // Save to Firebase Storage
    const bucket = admin.storage().bucket();
    const filePath = `users/${context.auth.uid}/${documentId}/epub.html`;
    const file = bucket.file(filePath);
    
    await file.save(Buffer.from(htmlContent, 'utf-8'), {
      metadata: { 
        contentType: 'text/html',
        metadata: {
          chapters: chapters.length.toString(),
          pages: results.length.toString(),
          generated: new Date().toISOString()
        }
      },
    });
    
    // Get signed URL for download
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491',
    });
    
    // Update document with EPUB URL
    await docRef.update({
      epubUrl: signedUrl,
      epubGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log('✅ EPUB generated successfully with', chapters.length, 'chapters');
    
    return {
      success: true,
      epubUrl: signedUrl,
      chapters: chapters.length,
      pages: results.length,
      message: `EPUB generated with ${chapters.length} chapters`
    };
    
  } catch (error) {
    console.error('❌ EPUB generation error:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'EPUB generation failed');
  }
}); 