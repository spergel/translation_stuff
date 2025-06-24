import { storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { TranslationResult } from '../types/translation';

export class FirebaseStorageManager {
  private static getBasePath(userId: string, documentId: string): string {
    return `users/${userId}/documents/${documentId}`;
  }

  // Upload original PDF file
  static async uploadOriginalFile(
    userId: string,
    documentId: string,
    file: File
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/original/${file.name}`;
    const storageRef = ref(storage, pathname);
    
    try {
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      console.log('📁 Uploaded original file:', url);
      return { url, pathname };
    } catch (error) {
      console.error('Failed to upload original file:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  // Store translation results as JSON
  static async storeTranslationResults(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    metadata: {
      filename: string;
      targetLanguage: string;
      pageCount: number;
      processingTimeMs: number;
    }
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/results/translation-results.json`;
    const storageRef = ref(storage, pathname);
    
    const data = {
      metadata,
      results,
      createdAt: new Date().toISOString(),
    };
    
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const snapshot = await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(snapshot.ref);
      
      console.log('💾 Stored translation results:', url);
      return { url, pathname };
    } catch (error) {
      console.error('Failed to store translation results:', error);
      throw new Error('Failed to store translation results');
    }
  }

  // Generate and upload translated PDF
  static async generateAndUploadPDF(
    userId: string,
    documentId: string,
    results: TranslationResult[],
    originalFilename: string
  ): Promise<{ url: string; pathname: string }> {
    const pathname = `${this.getBasePath(userId, documentId)}/translated/${originalFilename.replace('.pdf', '-translated.pdf')}`;
    const storageRef = ref(storage, pathname);
    
    try {
      // Generate PDF (using existing PDF generation logic)
      const pdfBuffer = await this.generatePDF(results);
      
      // Upload to Firebase Storage
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const snapshot = await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(snapshot.ref);
      
      console.log('📄 Generated translated PDF:', url);
      return { url, pathname };
    } catch (error) {
      console.error('Failed to generate or upload translated PDF:', error);
      throw new Error('Failed to generate or upload translated PDF');
    }
  }

  // Delete file from storage
  static async deleteFile(pathname: string): Promise<void> {
    const storageRef = ref(storage, pathname);
    try {
      await deleteObject(storageRef);
      console.log('🗑️ Deleted file:', pathname);
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  // Helper method to generate PDF (reuse existing PDF generation logic)
  private static async generatePDF(results: TranslationResult[]): Promise<Buffer> {
    // TODO: Implement PDF generation using existing logic
    throw new Error('PDF generation not implemented');
  }
} 