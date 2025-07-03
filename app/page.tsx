'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Trash2, Lock, Save, User, Check, CreditCard } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { TranslationResult, TranslationJob, TranslationMetadata, TargetLanguage, UserTier } from './types/translation'
import JobItem from './components/JobItem'
import DownloadAllButton from './components/DownloadAllButton'
import { processDocumentChunked } from './utils/chunkedTranslation'
import JobQueue from './components/JobQueue'
import TranslationSettings from './components/TranslationSettings'
import Header from './components/Header'
import LoginButton from './components/auth/LoginButton'
import Link from 'next/link'
import { SUBSCRIPTION_PLANS } from './lib/stripe'
import { useChapterDetection } from './hooks/useChapterDetection'

export default function Home() {
  const { data: session, status } = useSession()
  const [jobs, setJobs] = useState<TranslationJob[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState<TargetLanguage>('english')
  const [globalDownloadFormat, setGlobalDownloadFormat] = useState<'pdf' | 'html'>('pdf')
  const [showSavePrompt, setShowSavePrompt] = useState(false)

  // Get user tier from session, fallback to free for anonymous users
  const userTier: UserTier = (session?.user?.tier as UserTier) || 'free'
  
  // Chapter detection hook
  const { triggerChapterDetection, shouldTriggerChapterDetection } = useChapterDetection()

  // Prevent page unload when jobs are processing
  useEffect(() => {
    const hasProcessingJobs = jobs.some(job => job.status === 'processing');
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasProcessingJobs) {
        e.preventDefault();
        e.returnValue = 'You have active translations in progress. Leaving this page will lose your work. Are you sure?';
        return 'You have active translations in progress. Leaving this page will lose your work. Are you sure?';
      }
    };

    if (hasProcessingJobs) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [jobs]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const tierLimits = {
      free: { maxFiles: 1, maxSizeMB: 25 },
      basic: { maxFiles: 3, maxSizeMB: 25 },
      pro: { maxFiles: 10, maxSizeMB: 100 },
      enterprise: { maxFiles: 50, maxSizeMB: 2000 },
      anonymous: { maxFiles: 1, maxSizeMB: 5 }
    };
    const limits = session?.user ? tierLimits[userTier] : tierLimits.anonymous;

    if (acceptedFiles.length > limits.maxFiles) {
      if (!session?.user) {
        alert(`Anonymous users can translate 1 file at a time (max 5MB). Sign in for higher limits!`)
      } else {
        alert(`${userTier} tier allows maximum ${limits.maxFiles} files. Please select fewer files.`)
      }
      return;
    }

    const newJobs: TranslationJob[] = [];

    for (const file of acceptedFiles) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > limits.maxSizeMB) {
        if (!session?.user) {
          alert(`File "${file.name}" (${Math.round(sizeMB)}MB) exceeds anonymous limit of ${limits.maxSizeMB}MB. Sign in for higher limits!`);
        } else {
          alert(`File "${file.name}" (${Math.round(sizeMB)}MB) exceeds ${userTier} tier limit of ${limits.maxSizeMB}MB`);
        }
        continue;
      }

      try {
        // Upload directly to Vercel Blob for temporary storage
        const formData = new FormData();
        formData.append('file', file);
        
        const uploadResponse = await fetch('/api/upload-temp-file', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || 'Failed to upload file');
        }

        const uploadData = await uploadResponse.json();
        const { blobUrl, originalFilename, fileType, fileSize } = uploadData;

        const jobId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
        const abortController = new AbortController();
        let documentId: string | undefined = undefined;

        if (session?.user) {
          try {
            const documentResponse = await fetch('/api/documents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalFilename,
                title: originalFilename.replace(/\.pdf$/i, ''),
                targetLanguage: selectedLanguage,
                originalFileSize: fileSize,
                translationSettings: { extractImages: true, userTier }
              })
            });

            if (!documentResponse.ok) {
              const error = await documentResponse.json();
              if (error.code === 'DOCUMENT_LIMIT_EXCEEDED' || error.code === 'STORAGE_LIMIT_EXCEEDED') {
                alert(error.error);
                continue;
              }
              throw new Error(error.error || 'Failed to create document');
            }
            const { document } = await documentResponse.json();
            documentId = document.id;
          } catch (error) {
            console.error(`Failed to create document for ${originalFilename}:`, error);
            alert(`Failed to start processing for ${originalFilename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            continue;
          }
        }

        // Create new job
        const newJob: TranslationJob = {
          id: jobId,
          file: {
            name: originalFilename,
            type: fileType,
            size: fileSize,
            blobUrl: blobUrl
          },
          status: 'processing',
          progress: 0,
          targetLanguage: selectedLanguage,
          documentId,
          abortController,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        newJobs.push(newJob);

        // Start translation process with Firebase
        processDocumentChunked({
          file,
          targetLanguage: selectedLanguage,
          userTier,
          userId: session?.user?.id, // Pass userId directly instead of using global variable
          onProgress: (progress, message) => {
            setJobs(prevJobs => prevJobs.map(job => 
              job.id === jobId 
                ? { ...job, progress, status: 'processing' as const }
                : job
            ));
          },
          onPageComplete: (result) => {
            setJobs(prevJobs => prevJobs.map(job => 
              job.id === jobId 
                ? { ...job, results: [...(job.results || []), result] }
                : job
            ));
          },
          signal: abortController.signal
        }).then(async (results) => {
          // Update job status to completed
          setJobs(prevJobs => prevJobs.map(job => 
            job.id === jobId 
              ? { ...job, status: 'completed', progress: 100, results }
              : job
          ));

          // Trigger chapter detection for paid users if we have a documentId
          if (documentId && userTier !== 'free' && results && results.length > 0) {
            console.log('🔍 Triggering chapter detection for completed translation:', documentId);
            try {
              await triggerChapterDetection(documentId);
            } catch (error) {
              console.error('❌ Chapter detection failed, but translation is complete:', error);
              // Don't fail the translation if chapter detection fails
            }
          }
        }).catch(error => {
          console.error(`Translation failed for ${originalFilename}:`, error);
          setJobs(prevJobs => prevJobs.map(job => 
            job.id === jobId 
              ? { ...job, status: 'error', error: error.message }
              : job
          ));
        });

      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        alert(`Could not process ${file.name}: ${error instanceof Error ? error.message : 'Upload error'}. Please try again.`);
      }
    }

    if (newJobs.length > 0) {
      setJobs(prevJobs => [...prevJobs, ...newJobs]);
    }
  }, [session?.user, userTier, selectedLanguage]);

  // Function to update document in DB after completion and file uploads
  const updateCompletedDocumentInDB = async (
    documentId: string,
    results: TranslationResult[],
    originalFilename: string,
    targetLanguage: TargetLanguage,
    userId: string,
    processingTimeMs?: number,
    localJobId?: string
  ) => {
    if (!session?.user?.id || !documentId) {
      console.error("User ID or Document ID is missing, cannot update document in DB.");
      // Update UI to reflect this error for the specific job
      setJobs(prevJobs => prevJobs.map(j => {
        if (j.documentId === documentId) {
          return {
            ...j,
            status: 'error' as const,
            error: 'User session or document ID missing. Cannot save results.',
            statusMessage: 'Error: Could not save to your account.'
          };
        }
        return j;
      }));
      return;
    }

    let translatedPdfUrl: string | undefined = undefined;
    let translatedHtmlUrl: string | undefined = undefined;
    let updateError: string | null = null;

    try {
      console.log(`[DB Update] Starting PDF generation for ${documentId}`);
      // TODO: Implement Firebase Storage PDF generation
      // const pdfUploadResult = await FirebaseStorageManager.generateAndUploadPDF(
      //   userId,
      //   documentId,
      //   results,
      //   originalFilename
      // );
      // translatedPdfUrl = pdfUploadResult.url;
      console.log(`[DB Update] PDF generation temporarily disabled during migration`);

      console.log(`[DB Update] Starting HTML generation for ${documentId}`);
      // TODO: Implement Firebase Storage HTML generation
      // const htmlUploadResult = await FirebaseStorageManager.generateAndUploadHTML(
      //   userId,
      //   documentId,
      //   results,
      //   originalFilename,
      //   targetLanguage
      // );
      // translatedHtmlUrl = htmlUploadResult.url;
      console.log(`[DB Update] HTML generation temporarily disabled during migration`);
      
      const payload = {
        status: 'completed',
        progress: 100,
        translatedPdfUrl,
        translatedHtmlUrl,
        pageCount: results.length,
        processingTimeMs: processingTimeMs || undefined,
      };

      console.log(`[DB Update] Sending PUT request for ${documentId} with payload:`, payload);
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        updateError = errorData.error || 'Failed to update document in DB';
        throw new Error(updateError !== null ? updateError : 'Failed to update document in DB (unknown error)');
      }

      const updatedDocumentData = await response.json();
      console.log(`[DB Update] Successfully updated document ${documentId}:`, updatedDocumentData);

    } catch (error) {
      console.error(`[DB Update] Error updating document ${documentId} in DB:`, error);
      updateError = error instanceof Error ? error.message : 'Unknown DB update/upload error';
    } finally {
      // Update job status in UI regardless of success or failure of DB update
      setJobs(prevJobs => prevJobs.map(j => {
        if (j.documentId === documentId) {
          if (updateError) {
            return {
              ...j,
              status: 'error' as const,
              error: updateError !== null ? `Failed to save results: ${updateError}` : undefined,
              statusMessage: updateError !== null ? `Error saving to account: ${updateError}. Files might not be available.` : 'Error saving to account. Files might not be available.',
              results, 
              translatedPdfUrl: translatedPdfUrl || j.translatedPdfUrl,
              translatedHtmlUrl: translatedHtmlUrl || j.translatedHtmlUrl,
              syncing: false
            };
          } else {
            // Successful update
            return {
              ...j,
              status: 'completed' as const,
              progress: 100,
              results,
              statusMessage: 'Translation complete & saved!',
              translatedPdfUrl,
              translatedHtmlUrl,
              syncing: false
            };
          }
        }
        return j;
      }));
    }
  };

  // Note: pollJobStatus function removed - Firebase function handles translation synchronously

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true
  })

  const deleteJob = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    
    if (job?.status === 'processing' || job?.status === 'uploading') {
      // Show confirmation for active translations
      if (!confirm('This translation is in progress. Are you sure you want to cancel it?')) {
        return
      }

      // Abort any ongoing fetch requests
      job.abortController?.abort()
    }

    // Remove job from state
    setJobs(prev => prev.filter(j => j.id !== jobId))
  }

  const clearAllJobs = () => {
    const activeJobs = jobs.filter(job => 
      job.status === 'processing' || job.status === 'uploading'
    )
    
    if (activeJobs.length > 0) {
      const confirmed = window.confirm(
        `${activeJobs.length} translation${activeJobs.length > 1 ? 's are' : ' is'} still in progress.\n\n` +
        `Are you sure you want to cancel all translations and clear all jobs?\n\n` +
        `All ongoing translations will stop immediately and cannot be resumed.`
      )
      
      if (!confirmed) {
        return // User cancelled the clear all
      }
      
      // Cancel all ongoing translations
      activeJobs.forEach(job => {
        if (job.abortController) {
          console.log(`🛑 Cancelling translation for job ${job.id}`)
          job.abortController.abort()
        }
      })
    }
    
    setJobs([])
  }

  // Function to get the latest job states for components that need fresh data
  const getAllJobs = () => jobs

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white">
      <Header />
      
      <main className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-primary-300 mb-4 font-serif">
            AI-Powered PDF Translation
          </h1>
          <p className="text-lg text-primary-200 max-w-2xl mx-auto leading-relaxed font-serif">
            Upload your PDF documents and get AI-powered translations with side-by-side comparison. 
            Supports documents up to 100 pages.
          </p>
        </div>

        {/* User Status Bar - Clean single section */}
        {!session && status !== 'loading' && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-amber-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-amber-900">
                      Translating as Guest
                    </div>
                    <div className="text-xs text-amber-700">
                      Limit: 1 file, 5MB max • Sign in to save your work and get higher limits
                    </div>
                  </div>
                </div>
                <LoginButton />
              </div>
            </div>
          </div>
        )}

        {/* Save Prompt for Anonymous Users - Integrated into existing flow */}
        {showSavePrompt && !session && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                      <Save className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-emerald-900">
                      Save this translation?
                    </div>
                    <div className="text-xs text-emerald-700">
                      Sign in now to save your work and access it from any device
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setShowSavePrompt(false)}
                    className="text-xs text-emerald-600 hover:text-emerald-500 font-medium"
                  >
                    Maybe later
                  </button>
                  <LoginButton />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Translation Settings */}
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
          <div className="p-6">
            <TranslationSettings
              selectedLanguage={selectedLanguage}
              setSelectedLanguage={setSelectedLanguage}
              userTier={userTier}
              setUserTier={undefined}
              globalDownloadFormat={globalDownloadFormat}
              setGlobalDownloadFormat={setGlobalDownloadFormat}
            />
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
          <div className="p-6">
            <div
              {...getRootProps()}
              className={`upload-area ${isDragActive ? 'drag-active' : ''} min-h-[200px] flex items-center justify-center border-2 border-dashed border-amber-300 rounded-lg transition-colors ${isDragActive ? 'border-amber-400 bg-amber-50' : 'hover:border-amber-400 hover:bg-amber-50/30'}`}
            >
              <input {...getInputProps()} />
              <div className="text-center">
                <Upload className="mx-auto h-12 w-12 text-amber-400 mb-4" />
                <div className="text-lg font-medium text-primary-300 mb-2">
                  {isDragActive ? 'Drop PDF files here' : 'Drag & drop PDF files here, or click to select'}
                </div>
                {session ? (
                  <>
                    <div className="text-sm text-primary-200 mb-1">
                      {userTier === 'free'
                        ? 'Free tier: 1 file at a time, 25MB max per file'
                        : userTier === 'pro'
                          ? 'Pro tier: up to 10 files at a time, 100MB max per file'
                          : userTier === 'enterprise'
                            ? 'Enterprise: up to 50 files at a time, 2GB max per file'
                            : 'Guest: 1 file, 5MB max'}
                      {session.user.isEduEmail && <span className="ml-2 text-emerald-600">(.edu account)</span>}
                    </div>
                    {session && (
                      <div className="text-xs text-primary-100">
                        Stored: {session.user.documentsCount} of 1 documents • {Math.round(Number(session.user.storageUsedBytes) / (1024 * 1024))}MB used
                        {userTier === 'free' && session.user.documentsCount >= 1 && (
                          <span className="ml-2 text-amber-600">Delete old documents to upload new ones.</span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-amber-600">
                    Guest mode: 1 file, 5MB max • Translations not saved
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="bg-white border border-amber-200 rounded-lg shadow-sm mb-8">
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400"></div>
              <span className="ml-3 text-primary-200">Loading...</span>
            </div>
          </div>
        )}

        {/* Stay on Page Warning - Shows when jobs are processing */}
        {jobs.some(job => job.status === 'processing') && (
          <div className="mb-8">
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-lg p-6 shadow-md">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
                    <span className="text-red-600 text-xl font-bold">⚠️</span>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-lg font-semibold text-red-900 mb-2">
                    ⛔ IMPORTANT: Stay on this page during translation!
                  </div>
                  <div className="text-sm text-red-800 leading-relaxed">
                    <div className="mb-1">
                      <strong>• Do NOT close this tab or navigate away</strong> - your translation will be lost
                    </div>
                    <div className="mb-1">
                      <strong>• Keep your computer/phone awake</strong> - translation happens in your browser
                    </div>
                    <div>
                      <strong>• Large documents may take several minutes</strong> - please be patient
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Job Queue */}
        {jobs.length > 0 && (
          <div className="space-y-6">
            <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
              {/* Show download format selection only if at least one job is completed */}
              {jobs.some(j => j.status === 'completed') && (
                <div className="mb-6 flex items-center space-x-6">
                  <label className="text-sm font-medium text-primary-300">Download Format:</label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="pdf"
                      checked={globalDownloadFormat === 'pdf'}
                      onChange={() => setGlobalDownloadFormat('pdf')}
                      className="text-amber-500 focus:ring-amber-300 border-amber-300"
                    />
                    <span className="text-sm font-medium text-primary-300">PDF</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="downloadFormat"
                      value="html"
                      checked={globalDownloadFormat === 'html'}
                      onChange={() => setGlobalDownloadFormat('html')}
                      className="text-amber-500 focus:ring-amber-300 border-amber-300"
                    />
                    <span className="text-sm font-medium text-primary-300">HTML</span>
                  </label>
                </div>
              )}
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-3 sm:space-y-0 items-stretch sm:items-center">
                <DownloadAllButton 
                  jobs={jobs} 
                  format={globalDownloadFormat}
                  className="btn btn-secondary btn-sm w-full sm:w-auto"
                />
                <button
                  onClick={clearAllJobs}
                  className="btn btn-secondary btn-sm flex items-center space-x-2 w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Clear All</span>
                </button>
              </div>
              <JobQueue jobs={jobs} deleteJob={deleteJob} format={globalDownloadFormat} />
            </div>
          </div>
        )}

        {/* Pricing Section */}
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center text-primary-300 hover:text-primary-400 font-medium text-lg border border-amber-200 rounded-lg px-6 py-3 bg-white shadow-sm hover:bg-amber-50 transition-all duration-200"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              View premium pricing details
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
} 