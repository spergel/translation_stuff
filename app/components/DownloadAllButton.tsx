'use client'

import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { TranslationJob } from '../types/translation'
import { useDownloads } from '../hooks/useDownloads'

interface DownloadAllButtonProps {
  jobs: TranslationJob[]
  downloadFormat: 'pdf' | 'html'
}

export default function DownloadAllButton({ jobs, downloadFormat }: DownloadAllButtonProps) {
  const downloads = useDownloads()

  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.results && job.results.length > 0
  )

  if (completedJobs.length === 0) {
    return null
  }

  const handleDownloadAll = () => {
    if (downloadFormat === 'pdf') {
      downloads.downloadAllAsPDF(jobs)
    } else {
      downloads.downloadAllAsHTML(jobs, 'original_translation')
    }
  }

  return (
    <button 
      onClick={handleDownloadAll}
      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
    >
      <Download className="h-4 w-4" />
      <span>Download All {downloadFormat.toUpperCase()} ({completedJobs.length})</span>
    </button>
  )
} 