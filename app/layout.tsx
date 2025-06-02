import React from 'react'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import SessionProvider from './components/providers/SessionProvider'
import './types/auth' // Import type definitions

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5D4037',
}

export const metadata: Metadata = {
  title: 'AI PDF Translator - Translate Documents with AI',
  description: 'Professional AI-powered PDF translation service. Upload documents and get accurate translations with side-by-side comparison. Supports 10+ languages with beautiful HTML and PDF outputs.',
  keywords: ['PDF translator', 'AI translation', 'document translation', 'multilingual', 'Gemini AI', 'PDF converter'],
  authors: [{ name: 'AI PDF Translator' }],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" />
      </head>
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
} 