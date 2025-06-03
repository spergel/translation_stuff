'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from '../components/Header'
import DocumentViewer from '../components/DocumentViewer'
import UpgradePrompt from '../components/UpgradePrompt'
import { StorageBar } from '../components/StorageBar'
import { FileText, FolderOpen, Star, Download, Trash2, Clock, CheckCircle, XCircle, Loader, Eye, CreditCard } from 'lucide-react'
import Link from 'next/link'
import { SUBSCRIPTION_PLANS } from '../lib/stripe'

interface Document {
  id: string
  title: string
  originalFilename: string
  status: string
  createdAt: string
  pageCount?: number
  targetLanguage: string
  originalFileSize: number
  isFavorited: boolean
  progress: number
  translatedPdfUrl?: string
  translatedHtmlUrl?: string
  thumbnailUrl?: string
  processingTimeMs?: number
  folder?: {
    name: string
    color?: string
  }
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [showViewer, setShowViewer] = useState(false)
  const [loadingOperations, setLoadingOperations] = useState<{ [key: string]: boolean }>({})

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  useEffect(() => {
    if (session?.user) {
      fetchDocuments()
    }
  }, [session])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/documents')
      
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const deleteDocument = async (documentId: string) => {
    const document = documents.find(d => d.id === documentId)
    if (!document) return

    const confirmed = window.confirm(
      `Are you sure you want to delete "${document.title}"? This action cannot be undone.`
    )
    
    if (!confirmed) return

    try {
      setLoadingOperations(prev => ({ ...prev, [documentId]: true }))
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      // Remove from local state
      setDocuments(prev => prev.filter(d => d.id !== documentId))
      
      // Note: The user's storage and document count will be updated in the header automatically
      // when the page refreshes or session is updated
    } catch (err) {
      console.error('Error deleting document:', err)
      alert('Failed to delete document. Please try again.')
    } finally {
      setLoadingOperations(prev => ({ ...prev, [documentId]: false }))
    }
  }

  const downloadFile = async (documentId: string, format: 'pdf' | 'html') => {
    try {
      setLoadingOperations(prev => ({ ...prev, [`${documentId}-${format}`]: true }))
      // Open download in new tab to avoid interrupting the current page
      const downloadUrl = `/api/documents/${documentId}/download?format=${format}`
      window.open(downloadUrl, '_blank')
    } catch (err) {
      console.error('Error downloading file:', err)
      alert(`Failed to download ${format.toUpperCase()} file. Please try again.`)
    } finally {
      // Add a small delay before removing loading state to ensure user sees the loading indicator
      setTimeout(() => {
        setLoadingOperations(prev => ({ ...prev, [`${documentId}-${format}`]: false }))
      }, 1000)
    }
  }

  const openDocumentViewer = (document: Document) => {
    setSelectedDocument(document)
    setShowViewer(true)
  }

  const closeDocumentViewer = () => {
    setShowViewer(false)
    setSelectedDocument(null)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-primary-50">
        <Header />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="space-y-3">
              <div className="h-20 bg-gray-200 rounded"></div>
              <div className="h-20 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStorageUsagePercent = () => {
    const storageUsedMB = Number(session.user.storageUsedBytes) / (1024 * 1024)
    const tierLimits = {
      free: 5 * 1024, // 5GB in MB
      basic: 5 * 1024, // 5GB in MB
      pro: 25 * 1024, // 25GB in MB
      enterprise: 50 * 1024, // 50GB in MB
    }
    const limitMB = tierLimits[session.user.tier as keyof typeof tierLimits] || 5 * 1024
    return Math.min((storageUsedMB / limitMB) * 100, 100)
  }

  const getStatusIcon = (status: string, progress: number) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'processing':
        return <Loader className="h-5 w-5 text-blue-600 animate-spin" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />
      case 'queued':
        return <Clock className="h-5 w-5 text-yellow-600" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-primary-50">
      <Header />
      
      <main className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary-300 mb-2">My Documents</h1>
          <p className="text-gray-600">
            Manage your translated documents and view usage statistics. 
            All your translations are automatically saved here when you're signed in.
          </p>
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-amber-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-primary-300">Documents</p>
                <p className="text-2xl font-bold text-primary-300">
                  {session.user.documentsCount}
                  {session.user.tier !== 'enterprise' && (
                    <span className="text-sm font-normal text-primary-200">
                      /{session.user.tier === 'free' ? 5 : session.user.tier === 'basic' ? 50 : 500}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <FolderOpen className="h-8 w-8 text-amber-600" />
              <div className="ml-4 flex-grow">
                <p className="text-sm font-medium text-primary-300">Storage Used</p>
                <StorageBar 
                  usedBytes={Number(session.user.storageUsedBytes)} 
                  totalBytes={
                    session.user.tier === 'enterprise' 
                      ? 50 * 1024 * 1024 * 1024 // 50GB
                      : session.user.tier === 'pro'
                      ? 25 * 1024 * 1024 * 1024 // 25GB
                      : 5 * 1024 * 1024 * 1024  // 5GB for free and basic
                  }
                />
              </div>
            </div>
          </div>

          <div className="bg-white border border-amber-200 rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <Star className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-primary-300">Plan</p>
                <p className="text-2xl font-bold text-primary-300 capitalize">
                  {session.user.tier}
                  {session.user.isEduEmail && (
                    <span className="text-sm font-normal text-emerald-600 ml-1">(.edu)</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Prompt */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <CreditCard className="h-8 w-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-blue-900">
                  Upgrade for More Power
                </h3>
                <p className="text-sm text-blue-700">
                  Get faster translations, more documents, and larger storage with our premium plans
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              View Plans
            </Link>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-400" />
              <p className="ml-3 text-sm text-red-700">{error}</p>
              <button
                onClick={fetchDocuments}
                className="ml-auto text-sm text-red-600 hover:text-red-500 font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Documents List */}
        <div className="bg-white border border-amber-200 rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b border-amber-100">
            <h2 className="text-lg font-medium text-primary-300">Documents</h2>
          </div>
          
          {documents.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No documents yet</h3>
              <p className="mt-2 text-sm text-gray-500">
                When you translate PDFs while signed in, they'll automatically be saved here.
                You can access them anytime, download them again, and track your usage.
              </p>
              <button
                onClick={() => router.push('/')}
                className="mt-4 btn btn-primary"
              >
                Start Translating
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {documents.map((document) => (
                <div key={document.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="flex-shrink-0">
                        {document.thumbnailUrl ? (
                          <img 
                            src={document.thumbnailUrl} 
                            alt={`${document.title} preview`}
                            className="w-12 h-16 object-cover rounded border border-amber-200 shadow-sm"
                            onError={(e) => {
                              // Fallback to status icon if thumbnail fails to load
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              target.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                        ) : null}
                        <div className={document.thumbnailUrl ? 'hidden' : ''}>
                          {getStatusIcon(document.status, document.progress)}
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {document.title}
                          </h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(document.status)}`}>
                            {document.status}
                          </span>
                          {document.folder && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              {document.folder.name}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{formatFileSize(document.originalFileSize)}</span>
                          {document.pageCount && <span>{document.pageCount} pages</span>}
                          <span>→ {document.targetLanguage}</span>
                          <span>{formatDate(document.createdAt)}</span>
                          {document.processingTimeMs && (
                            <span>({Math.round(document.processingTimeMs / 1000)}s)</span>
                          )}
                        </div>
                        
                        {document.status === 'processing' && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                style={{ width: `${document.progress}%` }}
                              ></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{document.progress}% complete</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {document.status === 'completed' && (
                        <>
                          <button
                            onClick={() => openDocumentViewer(document)}
                            className="text-gray-400 hover:text-primary-300 transition-colors"
                            title="Preview translation"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {document.translatedPdfUrl && (
                            <button 
                              onClick={() => downloadFile(document.id, 'pdf')}
                              className="btn btn-secondary btn-sm relative"
                              title="Download PDF"
                              disabled={loadingOperations[`${document.id}-pdf`]}
                            >
                              {loadingOperations[`${document.id}-pdf`] ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                                </div>
                              ) : null}
                              <Download className="h-4 w-4" />
                              PDF
                            </button>
                          )}
                          {document.translatedHtmlUrl && (
                            <button 
                              onClick={() => downloadFile(document.id, 'html')}
                              className="btn btn-secondary btn-sm relative"
                              title="Download HTML"
                              disabled={loadingOperations[`${document.id}-html`]}
                            >
                              {loadingOperations[`${document.id}-html`] ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400"></div>
                                </div>
                              ) : null}
                              <Download className="h-4 w-4" />
                              HTML
                            </button>
                          )}
                        </>
                      )}
                      
                      <button
                        onClick={() => deleteDocument(document.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors relative"
                        title="Delete document"
                        disabled={loadingOperations[document.id]}
                      >
                        {loadingOperations[document.id] ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                          </div>
                        ) : null}
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          isOpen={showViewer}
          onClose={closeDocumentViewer}
          document={{
            id: selectedDocument.id,
            title: selectedDocument.title,
            targetLanguage: selectedDocument.targetLanguage,
            status: selectedDocument.status,
            translatedHtmlUrl: selectedDocument.translatedHtmlUrl,
            translatedPdfUrl: selectedDocument.translatedPdfUrl
          }}
        />
      )}
    </div>
  )
} 