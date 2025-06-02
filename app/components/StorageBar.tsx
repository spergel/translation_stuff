import React from 'react'

interface StorageBarProps {
  usedBytes: number
  totalBytes: number
}

export function StorageBar({ usedBytes, totalBytes }: StorageBarProps) {
  const percentage = Math.min((usedBytes / totalBytes) * 100, 100)
  
  // Format bytes to human readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0MB'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${Math.round(bytes / Math.pow(1024, i))}${sizes[i]}`
  }

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{formatBytes(usedBytes)}</span>
        <span>of {formatBytes(totalBytes)}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
} 