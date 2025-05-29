'use client'

import React from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'

interface FileUploadProps {
  onFilesAccepted: (files: File[]) => void
  isProcessing: boolean
}

export default function FileUpload({ onFilesAccepted, isProcessing }: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true,
    disabled: isProcessing,
    onDrop: onFilesAccepted
  })

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive 
          ? 'border-blue-400 bg-blue-50' 
          : 'border-gray-300 hover:border-gray-400'
        }
        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      {isDragActive ? (
        <p className="text-lg text-blue-600">Drop the PDF files here...</p>
      ) : (
        <div>
          <p className="text-lg text-gray-600 mb-2">
            Drag & drop PDF files here, or click to select
          </p>
          <p className="text-sm text-gray-500">
            Supports multiple files • PDF format only
          </p>
        </div>
      )}
    </div>
  )
} 