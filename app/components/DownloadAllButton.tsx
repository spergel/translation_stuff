'use client'

import React, { useState } from 'react'
import { Download } from 'lucide-react'
import { TranslationJob } from '../types/translation'
import { useDownloads } from '../hooks/useDownloads'

interface DownloadAllButtonProps {
  jobs: TranslationJob[]
  format: 'pdf' | 'html'
  className?: string
}

export default function DownloadAllButton({ jobs, format, className = "btn btn-primary" }: DownloadAllButtonProps) {
  const downloads = useDownloads()

  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.results && job.results.length > 0
  )

  if (completedJobs.length === 0) {
    return null
  }

  const handleDownloadAll = () => {
    if (format === 'pdf') {
      downloads.downloadAllAsPDF(jobs)
    } else {
      downloads.downloadAllAsHTML(jobs, 'original_translation')
    }
  }

  return (
    <button 
      onClick={handleDownloadAll}
      className={className}
    >
      <Download className="h-4 w-4" />
      <span>Download All {format.toUpperCase()} ({completedJobs.length})</span>
    </button>
  )
} 