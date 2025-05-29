'use client'

import React from 'react'
import { Download } from 'lucide-react'
import { TranslationJob } from '../types/translation'
import { useDownloads } from '../hooks/useDownloads'

interface DownloadAllButtonProps {
  jobs: TranslationJob[]
}

export default function DownloadAllButton({ jobs }: DownloadAllButtonProps) {
  const downloads = useDownloads()

  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.results && job.results.length > 0
  )

  if (completedJobs.length === 0) {
    return null
  }

  return (
    <div className="relative group">
      <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
        <Download className="h-4 w-4" />
        <span>Download All ({completedJobs.length})</span>
        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Dropdown Menu */}
      <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
        <div className="py-2">
          <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
            Download All Translations ({completedJobs.length} files):
          </div>
          
          <div className="px-4 py-1 text-xs font-medium text-gray-600 bg-gray-50">
            PDF Formats:
          </div>
          
          <button
            onClick={() => downloads.downloadAllAsPDF(jobs, 'transcription_translation')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="font-medium">All as Transcription + Translation PDF (ZIP)</div>
            <div className="text-xs text-gray-500">Side-by-side PDF with transcription and translation</div>
          </button>
          
          <button
            onClick={() => downloads.downloadAllAsPDF(jobs, 'original_translation')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="font-medium">All as Original + Translation PDF (ZIP)</div>
            <div className="text-xs text-gray-500">Side-by-side PDF with original images and translation</div>
          </button>
          
          <button
            onClick={() => downloads.downloadAllAsPDF(jobs, 'translation_only')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="font-medium">All as Translation Only PDF (ZIP)</div>
            <div className="text-xs text-gray-500">Clean PDF with translations only</div>
          </button>
          
          <button
            onClick={() => downloads.downloadAllAsPDF(jobs, 'complete_analysis')}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="font-medium">All as Complete Analysis PDF (ZIP)</div>
            <div className="text-xs text-gray-500">Original + Transcription + Translation (3 columns)</div>
          </button>
          
          <div className="border-t border-gray-100 mt-2 pt-2">
            <div className="px-4 py-1 text-xs font-medium text-gray-600 bg-gray-50">
              HTML Formats:
            </div>
            
            <button
              onClick={() => downloads.downloadAllAsHTML(jobs, 'transcription_translation')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">All as Transcription + Translation HTML (ZIP)</div>
              <div className="text-xs text-gray-500">Clean text transcription with translation side-by-side</div>
            </button>
            
            <button
              onClick={() => downloads.downloadAllAsHTML(jobs, 'original_translation')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">All as Side-by-Side HTML (ZIP)</div>
              <div className="text-xs text-gray-500">Original + Translation format for all files</div>
            </button>
            
            <button
              onClick={() => downloads.downloadAllAsHTML(jobs, 'translation_only')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">All as Translation Only HTML (ZIP)</div>
              <div className="text-xs text-gray-500">Clean, readable translations only</div>
            </button>
            
            <button
              onClick={() => downloads.downloadAllAsHTML(jobs, 'complete_analysis')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">All as Complete Analysis HTML (ZIP)</div>
              <div className="text-xs text-gray-500">Original + Transcription + Translation (3 columns)</div>
            </button>
          </div>
          
          <div className="border-t border-gray-100 mt-2 pt-2">
            <button
              onClick={() => downloads.downloadAllAsPDF(jobs)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium">All as Individual PDFs (ZIP) - Legacy</div>
              <div className="text-xs text-gray-500">Original individual PDF format</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 