
'use client'

import React from 'react'
import { FileText, Download, Eye, RotateCcw, Trash2, X } from 'lucide-react'
import { TranslationJob } from '../types/translation'

interface JobQueueProps {
  jobs: TranslationJob[]
  onCancelJob: (jobId: string) => void
  onRetryJob: (jobId: string) => void
  onRemoveJob: (jobId: string) => void
  onDownloadHTML: (job: TranslationJob, format: string) => void
  onPreviewJob: (job: TranslationJob) => void
}

export default function JobQueue({
  jobs,
  onCancelJob,
  onRetryJob,
  onRemoveJob,
  onDownloadHTML,
  onPreviewJob
}: JobQueueProps) {
  const getStatusColor = (status: TranslationJob['status']) => {
    switch (status) {
      case 'uploading': return 'bg-blue-500'
      case 'processing': return 'bg-yellow-500'
      case 'completed': return 'bg-green-500'
      case 'error': return 'bg-red-500'
      case 'extracting-images': return 'bg-purple-500'
      case 'cancelled': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (status: TranslationJob['status']) => {
    switch (status) {
      case 'uploading': return 'Uploading'
      case 'processing': return 'Processing'
      case 'completed': return 'Completed'
      case 'error': return 'Error'
      case 'extracting-images': return 'Extracting Images'
      case 'cancelled': return 'Cancelled'
      default: return 'Unknown'
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>No translation jobs yet. Upload a PDF to get started!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Translation Queue</h2>
      
      {jobs.map((job, index) => (
        <div key={job.id} className="bg-white border rounded-lg p-4 shadow-sm">
          {/* Job Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <FileText className="h-5 w-5 text-gray-500" />
              <div>
                <h3 className="font-medium text-gray-900">{job.filename}</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-500">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(job.status)}`}>
                    {getStatusText(job.status)}
                  </span>
                  {job.totalPages && (
                    <span>• {job.totalPages} pages</span>
                  )}
                  {jobs.length > 1 && (
                    <span>• Position {index + 1} of {jobs.length}</span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {job.status === 'processing' && (
                <button
                  onClick={() => onCancelJob(job.id)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              
              {job.status === 'error' && (
                <button
                  onClick={() => onRetryJob(job.id)}
                  className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Retry"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              
              {job.status === 'completed' && job.results && (
                <>
                  <button
                    onClick={() => onPreviewJob(job)}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  
                  <div className="relative group">
                    <button className="p-2 text-gray-400 hover:text-green-600 transition-colors">
                      <Download className="h-4 w-4" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <div className="p-2 space-y-1">
                        {/* Always available */}
                        <button
                          onClick={() => onDownloadHTML(job, 'translation-only')}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                        >
                          Translation Only
                        </button>
                        
                        {/* Show only if original text is available */}
                        {job.results.some(page => 
                          page.original_text && 
                          page.original_text.trim() && 
                          !page.original_text.includes('This page contains only an image') &&
                          !page.original_text.includes('Could not extract text')
                        ) && (
                          <>
                            <button
                              onClick={() => onDownloadHTML(job, 'original-next-to-translation')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              Original Text + Translation
                            </button>
                            <button
                              onClick={() => onDownloadHTML(job, 'side-by-side')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              Side by Side
                            </button>
                            <button
                              onClick={() => onDownloadHTML(job, 'original-next-to-transcription')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              Original Text + Transcription
                            </button>
                            <button
                              onClick={() => onDownloadHTML(job, 'transcription-next-to-translation')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              Transcription + Translation
                            </button>
                            <button
                              onClick={() => onDownloadHTML(job, 'original-transcription-translation')}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                            >
                              Complete Analysis
                            </button>
                          </>
                        )}
                        
                        {/* Show only if page images are available */}
                        {job.results.some(page => page.page_image && page.page_image.length > 0) && (
                          <button
                            onClick={() => onDownloadHTML(job, 'original-image-next-to-translation')}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded"
                          >
                            Page Images + Translation
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              <button
                onClick={() => onRemoveJob(job.id)}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {(job.status === 'uploading' || job.status === 'processing' || job.status === 'extracting-images') && (
            <div className="mb-3">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {job.statusMessage || job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </span>
                <span>{job.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getStatusColor(job.status)}`}
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              
              {/* Additional status details */}
              {job.currentPage && job.totalPages && (
                <div className="text-xs text-gray-500 mt-1">
                  Page {job.currentPage} of {job.totalPages}
                  {job.results && job.results.length > 0 && (
                    <span className="ml-2">• {job.results.length} completed</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Current Page Info */}
          {job.status === 'processing' && job.statusMessage && !job.statusMessage.includes('Page') && (
            <div className="text-sm text-blue-600 mb-2 bg-blue-50 rounded p-2">
              💫 {job.statusMessage}
            </div>
          )}

          {/* Results Summary for Active Jobs */}
          {job.status === 'processing' && job.results && job.results.length > 0 && (
            <div className="text-sm text-blue-600 mb-2 bg-blue-50 rounded p-2">
              📄 {job.results.length} pages completed
              {job.results.some(r => r.page_image) && (
                <span> • Images included</span>
              )}
            </div>
          )}

          {/* Error Message */}
          {job.status === 'error' && job.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
              <strong>Error:</strong> {job.error}
            </div>
          )}

          {/* Results Summary */}
          {job.status === 'completed' && job.results && (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-700">
              <strong>Completed:</strong> Successfully translated {job.results.length} pages
              {job.metadata?.target_language && ` to ${job.metadata.target_language}`}
              <br />
              <span className="text-xs text-green-600">
                Page images automatically included in all export formats
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
} 