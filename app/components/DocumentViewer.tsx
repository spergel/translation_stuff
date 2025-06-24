'use client'

import React, { useState } from 'react'
import { X, Download, ExternalLink, Eye } from 'lucide-react'
import { TranslationResult } from '../types/translation'

interface DocumentViewerProps {
  isOpen: boolean
  onClose: () => void
  document: {
    id: string
    title: string
    targetLanguage: string
    status: string
    translatedHtmlUrl?: string
    translatedPdfUrl?: string
  }
  results?: TranslationResult[]
}

export default function DocumentViewer({ isOpen, onClose, document, results }: DocumentViewerProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'full'>('preview')

  if (!isOpen) return null

  const downloadFile = (format: 'pdf' | 'html') => {
    const downloadUrl = `/api/documents/${document.id}/download?format=${format}`
    window.open(downloadUrl, '_blank')
  }

  const openFullView = () => {
    if (document.translatedHtmlUrl) {
      window.open(document.translatedHtmlUrl, '_blank')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-amber-200">
          <div>
            <h2 className="text-xl font-bold text-primary-300">{document.title}</h2>
            <p className="text-sm text-primary-200">
              Translated to {document.targetLanguage} • {results?.length || 0} pages
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {document.status === 'completed' && (
              <>
                <button
                  onClick={openFullView}
                  className="btn btn-secondary btn-sm"
                  title="View side by side"
                >
                  <Eye className="h-4 w-4" />
                  Side by Side
                </button>
                <button
                  onClick={() => downloadFile('pdf')}
                  className="btn btn-secondary btn-sm"
                  title="Download PDF"
                >
                  <Download className="h-4 w-4" />
                  PDF
                </button>
                <button
                  onClick={() => downloadFile('html')}
                  className="btn btn-secondary btn-sm"
                  title="Download HTML"
                >
                  <Download className="h-4 w-4" />
                  HTML
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              title="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {document.status !== 'completed' ? (
            <div className="flex items-center justify-center h-full text-center p-8">
              <div>
                <div className="text-lg font-medium text-primary-300 mb-2">
                  Translation {document.status}
                </div>
                <p className="text-primary-200">
                  {document.status === 'processing' 
                    ? 'Your document is being translated. This may take a few minutes.'
                    : document.status === 'failed'
                    ? 'Translation failed. Please try again.'
                    : 'Translation is queued for processing.'
                  }
                </p>
              </div>
            </div>
          ) : !results || results.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center p-8">
              <div>
                <div className="text-lg font-medium text-primary-300 mb-2">
                  Preview not available
                </div>
                <p className="text-primary-200 mb-4">
                  Translation completed, but preview data is not available.
                </p>
                <div className="space-x-3">
                  {document.translatedHtmlUrl && (
                    <button onClick={openFullView} className="btn btn-primary">
                      View Full Translation
                    </button>
                  )}
                  {document.translatedPdfUrl && (
                    <button onClick={() => downloadFile('pdf')} className="btn btn-secondary">
                      Download PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-y-auto p-6">
              {/* Quick preview of first few pages */}
              <div className="space-y-6">
                {results.slice(0, 3).map((result) => (
                  <div key={result.page_number} className="bg-primary-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-primary-300">Page {result.page_number}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-primary-200 mb-2">Original</h4>
                        <div className="bg-white p-3 rounded border text-sm max-h-32 overflow-y-auto">
                          {result.original_text?.substring(0, 200) || 'No text extracted'}
                          {result.original_text && result.original_text.length > 200 && '...'}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-primary-200 mb-2">Translation</h4>
                        <div className="bg-white p-3 rounded border text-sm max-h-32 overflow-y-auto">
                          {result.translated_text?.substring(0, 200) || 'No translation available'}
                          {result.translated_text && result.translated_text.length > 200 && '...'}
                        </div>
                      </div>
                    </div>
                    
                    {result.notes && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium text-amber-700 mb-1">Notes</h4>
                        <div className="bg-amber-50 p-2 rounded text-sm text-amber-800">
                          {result.notes.substring(0, 150)}
                          {result.notes.length > 150 && '...'}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {results.length > 3 && (
                  <div className="text-center py-4">
                    <p className="text-primary-200 mb-3">
                      Showing 3 of {results.length} pages
                    </p>
                    {document.translatedHtmlUrl && (
                      <button onClick={openFullView} className="btn btn-primary">
                        View Complete Translation
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 