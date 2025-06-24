import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, updateDoc, deleteDoc } from 'firebase/firestore';

// Collection names
export const COLLECTIONS = {
  USERS: 'users',
  DOCUMENTS: 'documents',
  FOLDERS: 'folders',
  USAGE_RECORDS: 'usageRecords',
} as const;

// User schema
export interface User {
  id: string;
  name?: string;
  email: string;
  emailVerified?: Date;
  image?: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  isEduEmail: boolean;
  storageUsedBytes: number;
  documentsCount: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string;
  subscriptionPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Document schema
export interface Document {
  id: string;
  userId: string;
  originalFilename: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  originalFileSize: number;
  originalFileUrl?: string;
  pageCount?: number;
  targetLanguage: string;
  translationSettings?: any;
  translatedPdfUrl?: string;
  translatedHtmlUrl?: string;
  thumbnailUrl?: string;
  folderId?: string;
  tags: string[];
  isFavorited: boolean;
  processingTimeMs?: number;
  tokensUsed?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Folder schema
export interface Folder {
  id: string;
  userId: string;
  name: string;
  color?: string;
  parentFolderId?: string;
  createdAt: Date;
}

// Usage Record schema
export interface UsageRecord {
  id: string;
  userId: string;
  documentId?: string;
  pagesProcessed: number;
  tokensUsed?: number;
  processingTimeMs?: number;
  createdAt: Date;
}

// Helper functions for Firestore operations
export const firestoreHelpers = {
  // User operations
  async createUser(user: Omit<User, 'id'>): Promise<User> {
    const userRef = doc(collection(db, COLLECTIONS.USERS));
    const newUser = { ...user, id: userRef.id };
    await setDoc(userRef, newUser);
    return newUser;
  },

  async getUser(id: string): Promise<User | null> {
    const userRef = doc(db, COLLECTIONS.USERS, id);
    const userSnap = await getDoc(userRef);
    return userSnap.exists() ? (userSnap.data() as User) : null;
  },

  async updateUser(id: string, data: Partial<User>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, id);
    await updateDoc(userRef, { ...data, updatedAt: new Date() });
  },

  // Document operations
  async createDocument(document: Omit<Document, 'id'>): Promise<Document> {
    const docRef = doc(collection(db, COLLECTIONS.DOCUMENTS));
    const newDoc = { ...document, id: docRef.id };
    await setDoc(docRef, newDoc);
    return newDoc;
  },

  async getDocument(id: string): Promise<Document | null> {
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as Document) : null;
  },

  async getUserDocuments(userId: string): Promise<Document[]> {
    const q = query(
      collection(db, COLLECTIONS.DOCUMENTS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Document);
  },

  async updateDocument(id: string, data: Partial<Document>): Promise<void> {
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    await updateDoc(docRef, { ...data, updatedAt: new Date() });
  },

  async deleteDocument(id: string): Promise<void> {
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    await deleteDoc(docRef);
  },

  // Folder operations
  async createFolder(folder: Omit<Folder, 'id'>): Promise<Folder> {
    const folderRef = doc(collection(db, COLLECTIONS.FOLDERS));
    const newFolder = { ...folder, id: folderRef.id };
    await setDoc(folderRef, newFolder);
    return newFolder;
  },

  async getUserFolders(userId: string): Promise<Folder[]> {
    const q = query(
      collection(db, COLLECTIONS.FOLDERS),
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Folder);
  },

  // Usage Record operations
  async createUsageRecord(record: Omit<UsageRecord, 'id'>): Promise<UsageRecord> {
    const recordRef = doc(collection(db, COLLECTIONS.USAGE_RECORDS));
    const newRecord = { ...record, id: recordRef.id };
    await setDoc(recordRef, newRecord);
    return newRecord;
  },

  async getUserUsageRecords(userId: string, recordLimit: number = 100): Promise<UsageRecord[]> {
    const q = query(
      collection(db, COLLECTIONS.USAGE_RECORDS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(recordLimit)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UsageRecord);
  },
}; 