import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { TranslationResult } from '../../app/types/translation';
import { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { UserRecord } from 'firebase-admin/auth';

admin.initializeApp();

interface TranslationTask {
  documentId: string;
  userId: string;
  targetLanguage: string;
  originalFileUrl: string;
  translationSettings?: any;
}

export const processTranslation = functions.firestore
  .document('documents/{documentId}')
  .onCreate(async (snap: QueryDocumentSnapshot, context: functions.EventContext) => {
    const document = snap.data() as TranslationTask;
    const documentId = context.params.documentId;

    try {
      // Update document status to processing
      await snap.ref.update({
        status: 'processing',
        progress: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // TODO: Implement actual translation logic here
      // This would involve:
      // 1. Downloading the original file from Firebase Storage
      // 2. Processing it with the translation service
      // 3. Uploading the results back to Firebase Storage
      // 4. Updating the document with the results

      // For now, we'll just simulate a successful translation
      const results: TranslationResult[] = [
        {
          page_number: 1,
          original_text: 'Sample text',
          translated_text: 'Translated text',
          page_image: '',
          notes: 'Sample translation'
        },
      ];

      // Update document with results
      await snap.ref.update({
        status: 'completed',
        progress: 100,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Add other fields as needed
      });

      // Create usage record
      await admin.firestore().collection('usageRecords').add({
        userId: document.userId,
        documentId,
        pagesProcessed: 1,
        tokensUsed: 100,
        processingTimeMs: 5000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    } catch (error: unknown) {
      console.error('Error processing translation:', error);
      
      // Update document with error status
      await snap.ref.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

// Function to handle user creation
export const onUserCreated = functions.auth.user().onCreate(async (user: UserRecord) => {
  try {
    // Create user document in Firestore
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
  } catch (error) {
    console.error('Error creating user document:', error);
  }
});

// Function to handle user deletion
export const onUserDeleted = functions.auth.user().onDelete(async (user: UserRecord) => {
  try {
    // Delete user's documents from Storage
    const bucket = admin.storage().bucket();
    const prefix = `users/${user.uid}/`;
    await bucket.deleteFiles({ prefix });

    // Delete user's documents from Firestore
    const userDocs = await admin.firestore()
      .collection('documents')
      .where('userId', '==', user.uid)
      .get();

    const batch = admin.firestore().batch();
    userDocs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete user document
    await admin.firestore().collection('users').doc(user.uid).delete();
  } catch (error) {
    console.error('Error cleaning up user data:', error);
  }
}); 