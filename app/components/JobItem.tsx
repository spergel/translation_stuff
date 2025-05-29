'use client'

import React from 'react'
import { FileText, Download, Eye, X } from 'lucide-react'
import { TranslationJob } from '../types/translation'
import { useDownloads } from '../hooks/useDownloads'
import { generateHTML } from '../utils/downloads'

interface JobItemProps {
  job: TranslationJob
  onDelete: (jobId: string) => void
}

export default function JobItem({ job, onDelete }: JobItemProps) {
  const downloads = useDownloads()

  const openQuickView = () => {
    if (!job.results) {
      alert('No translation results available')
      return
    }
    console.log('Opening quick view for:', job.filename, 'with', job.results.length, 'pages')
    try {
      const html = generateHTML(job.results, job.filename)
      console.log('Generated HTML length:', html.length)
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
        console.log('Quick view opened successfully')
      } else {
        alert('Failed to open new window. Please check if popups are blocked.')
      }
    } catch (error) {
      console.error('Error opening quick view:', error)
      alert('Error opening view: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <FileText className="h-6 w-6 text-primary-300" />
          <span className="font-medium text-gray-900">{job.filename}</span>
          <span className={`px-2 py-1 text-xs rounded-full ${
            job.status === 'completed' ? 'bg-green-100 text-green-800' :
            job.status === 'error' ? 'bg-red-100 text-red-800' :
            job.status === 'cancelled' ? 'bg-orange-100 text-orange-800' :
            job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
            job.status === 'extracting-images' ? 'bg-purple-100 text-purple-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {job.status === 'extracting-images' ? 'extracting images' : job.status}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {job.status === 'completed' && job.results && (
            <>
              <button
                onClick={() => downloads.viewSideBySide(job)}
                className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Eye className="h-4 w-4" />
                <span>Side-by-Side</span>
              </button>
              <button
                onClick={openQuickView}
                className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <Eye className="h-4 w-4" />
                <span>Quick View</span>
              </button>
              <button
                onClick={() => downloads.previewStructuredLayout(job)}
                className="flex items-center space-x-1 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                <Eye className="h-4 w-4" />
                <span>Preview Layout</span>
              </button>
              
              {/* Download Dropdown Menu */}
              <div className="relative group">
                <button className="flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                  <Download className="h-4 w-4" />
                  <span>Download</span>
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <div className="py-2">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                      Choose Download Format:
                    </div>
                    
                    <button
                      onClick={() => downloads.downloadOriginalNextToTranslation(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Original + Translation</div>
                      <div className="text-xs text-gray-500">Side-by-side comparison</div>
                    </button>
                    
                    <button
                      onClick={() => downloads.downloadOriginalImageNextToTranslation(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Original Image + Translation</div>
                      <div className="text-xs text-gray-500">Clean image with translation only</div>
                    </button>
                    
                    <button
                      onClick={() => downloads.downloadOriginalNextToTranscription(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Original + Transcription</div>
                      <div className="text-xs text-gray-500">Original text with clean transcription</div>
                    </button>
                    
                    <button
                      onClick={() => downloads.downloadOriginalTranscriptionTranslation(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Original + Transcription + Translation</div>
                      <div className="text-xs text-gray-500">Complete three-column analysis</div>
                    </button>
                    
                    <button
                      onClick={() => downloads.downloadTranscriptionNextToTranslation(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Transcription + Translation</div>
                      <div className="text-xs text-gray-500">Clean text with translation</div>
                    </button>
                    
                    <button
                      onClick={() => downloads.downloadTranslationOnly(job)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-medium">Translation Only</div>
                      <div className="text-xs text-gray-500">Clean, readable translation</div>
                    </button>
                    
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button
                        onClick={() => downloads.downloadHTML(job)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium">Legacy HTML Format</div>
                        <div className="text-xs text-gray-500">Original format (deprecated)</div>
                      </button>
                      
                      <button
                        onClick={() => downloads.downloadPDF(job)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium">Structured PDF</div>
                        <div className="text-xs text-gray-500">PDF with layout preservation</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className={`flex items-center space-x-1 px-3 py-2 text-white rounded-md transition-colors ${
              job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                ? 'bg-orange-600 hover:bg-orange-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
            title={
              job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                ? 'Cancel translation and delete job'
                : 'Delete this job'
            }
          >
            <X className="h-4 w-4" />
            <span>
              {job.status === 'processing' || job.status === 'uploading' || job.status === 'extracting-images'
                ? 'Cancel'
                : 'Delete'
              }
            </span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span className="capitalize">{job.status}</span>
          <span>
            {job.currentPage && job.totalPages ? 
              `Page ${job.currentPage} / ${job.totalPages}` : 
              `${job.progress}%`
            }
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              job.status === 'error' ? 'bg-red-500' : 
              job.status === 'cancelled' ? 'bg-orange-500' : 
              'bg-primary-300'
            }`}
            style={{ width: `${job.progress}%` }}
          />
        </div>
        {job.statusMessage && (
          <div className="mt-2 text-sm text-gray-600">
            {job.statusMessage}
          </div>
        )}
      </div>

      {job.error && (
        <div className={`border rounded-md p-3 ${
          job.status === 'cancelled' 
            ? 'bg-orange-50 border-orange-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <p className={`text-sm ${
            job.status === 'cancelled' 
              ? 'text-orange-700' 
              : 'text-red-700'
          }`}>
            {job.status === 'cancelled' && job.error.includes('cancelled') 
              ? '🛑 Translation was cancelled by user. The process was stopped and cannot be resumed.'
              : job.error
            }
          </p>
        </div>
      )}

      {job.results && job.results.length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium text-gray-900 mb-2">
            Translation Preview ({job.results.length} pages)
            {job.results.some(r => r.notes?.includes('error') || r.notes?.includes('failed') || r.translated_text?.includes('Could not process')) && (
              <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                Some pages had issues
              </span>
            )}
          </h3>
          <div className="bg-gray-50 rounded-md p-4 max-h-40 overflow-y-auto">
            <p className="text-sm text-gray-700">
              {job.results[0].translated_text.substring(0, 200)}...
            </p>
            {job.results.some(r => r.notes?.includes('error') || r.notes?.includes('failed') || r.translated_text?.includes('Could not process')) && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                <strong>Note:</strong> Some pages encountered transmission or processing errors. 
                These pages will show placeholder text or partial content in the final download.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 