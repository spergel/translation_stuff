'use client'

import React from 'react'
import { TranslationJob } from '../types/translation'
import JobItem from './JobItem'

interface JobQueueProps {
  jobs: TranslationJob[]
  deleteJob: (jobId: string) => void
  format: 'pdf' | 'html'
}

export default function JobQueue({ jobs, deleteJob, format }: JobQueueProps) {
  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <JobItem 
          key={job.id} 
          job={job} 
          onDelete={deleteJob} 
          downloadFormat={format} 
        />
      ))}
    </div>
  )
} 