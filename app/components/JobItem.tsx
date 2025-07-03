'use client'

import React from 'react'
import { FileText, Download, Eye, X } from 'lucide-react'
import { TranslationJob } from '../types/translation'
import { useDownloads } from '../hooks/useDownloads'
import { generateHTML, generateTranslationOnlyHTML } from '../utils/htmlGenerators'

interface JobItemProps {
  job: TranslationJob
  onDelete: (jobId: string) => void
  getAllJobs?: () => TranslationJob[]
  downloadFormat: 'pdf' | 'html'
}

export default function JobItem({ job, onDelete, getAllJobs, downloadFormat }: JobItemProps) {
  const downloads = useDownloads()
  const [isLoadingSideBySide, setIsLoadingSideBySide] = React.useState(false)
  const [showQuickView, setShowQuickView] = React.useState(false)

  const handleSideBySideView = async () => {
    setIsLoadingSideBySide(true)
    try {
      console.log('📄 Opening side-by-side view...')
      
      // Get the latest job state if possible
      const getLatestJob = (): TranslationJob => {
        if (getAllJobs) {
          const latestJob = getAllJobs().find(j => j.id === job.id)
          if (latestJob) {
            console.log(`📄 Using latest job state: ${latestJob.results?.length || 0} pages available`)
            return latestJob
          }
        }
        console.log(`📄 Using prop job state: ${job.results?.length || 0} pages available`)
        return job
      }
      
      const currentJob = getLatestJob()
      console.log(`📄 Opening side-by-side with ${currentJob.results?.length || 0} pages`)
      
      downloads.viewSideBySide(currentJob)
    } catch (error) {
      console.error('Error opening side-by-side view:', error)
      const fallbackJob = getAllJobs ? getAllJobs().find(j => j.id === job.id) || job : job
      downloads.viewSideBySide(fallbackJob)
    } finally {
      setIsLoadingSideBySide(false)
    }
  }

  const openTranslationOnly = () => {
    if (!job.results || job.results.length === 0) {
      return
    }
    console.log('Opening translation-only view for:', job.file.name, 'with', job.results.length, 'pages')
    try {
      // Generate translation-only HTML and open in new window
      const html = generateTranslationOnlyHTML(job.results, job.file.name)
      const newWindow = window.open('', '_blank')
      if (newWindow) {
        newWindow.document.write(html)
        newWindow.document.close()
        console.log('Translation-only view opened successfully')
      } else {
        alert('Failed to open new window. Please check if popups are blocked.')
      }
    } catch (error) {
      console.error('Error opening translation-only view:', error)
      alert('Error opening view: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleDownload = (translationOnly = false) => {
    if (downloadFormat === 'pdf') {
      downloads.downloadPDF(job, translationOnly)
    } else {
      downloads.downloadHTML(job, translationOnly)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <FileText className="h-6 w-6 text-primary-300" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              <span className="font-medium text-gray-900">{job.file.name}</span>
            </p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            job.status === 'completed' ? 'bg-green-100 text-green-800' :
            job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
            job.status === 'uploading' ? 'bg-yellow-100 text-yellow-800' :
            job.status === 'error' ? 'bg-red-100 text-red-800' :
            job.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {job.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap items-center justify-end mb-4">
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-end">
            {job.status === 'completed' && job.results && (
              <>
                <button
                  onClick={handleSideBySideView}
                  disabled={isLoadingSideBySide}
                  className="btn btn-primary flex items-center space-x-1 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center"
                >
                  <Eye className="h-4 w-4" />
                  <span>{isLoadingSideBySide ? 'Loading...' : 'Original vs Translation'}</span>
                </button>
                <button
                  onClick={openTranslationOnly}
                  className="btn btn-success flex items-center space-x-1 px-3 py-2 w-full sm:w-auto justify-center"
                >
                  <Eye className="h-4 w-4" />
                  <span>Translation Only</span>
                </button>
                {/* Download Dropdown Menu */}
                <div className="relative group w-full sm:w-auto">
                  <button className="btn btn-accent flex items-center space-x-1 px-3 py-2 w-full sm:w-auto justify-center">
                    <Download className="h-4 w-4" />
                    <span>Download {downloadFormat.toUpperCase()}</span>
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-full sm:w-80 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                    <div className="py-2">
                      <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                        Choose Download Format:
                      </div>
                      <button
                        onClick={() => handleDownload(false)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium">Side-by-Side {downloadFormat === 'pdf' ? 'PDF' : 'HTML'}</div>
                        <div className="text-xs text-gray-500">Original image with translation</div>
                      </button>
                      <button
                        onClick={() => handleDownload(true)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium">Translation Only {downloadFormat === 'pdf' ? 'PDF' : 'HTML'}</div>
                        <div className="text-xs text-gray-500">Clean translation text only</div>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
            {/* Show cancel button for active jobs */}
            {(job.status === 'processing' || job.status === 'uploading') && (
              <button
                onClick={() => onDelete(job.id)}
                className="btn btn-error px-3 py-1 text-sm w-full sm:w-auto justify-center"
              >
                Cancel
              </button>
            )}
            {/* Show delete button for completed/error jobs */}
            {(job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') && (
              <button
                onClick={() => onDelete(job.id)}
                className="btn btn-secondary px-3 py-1 text-sm w-full sm:w-auto justify-center"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span className="capitalize">{job.status}</span>
          <span>{job.progress}%</span>
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

      {job.syncing && (
        <div className="flex items-center text-amber-500 mt-2">
          <span className="animate-spin mr-2">⏳</span>
          Syncing with server...
        </div>
      )}
    </div>
  )
} 