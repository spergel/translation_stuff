import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5D4037',
}

export const metadata: Metadata = {
  title: 'Dashboard - AI PDF Translator',
  description: 'Manage your translated documents and view usage statistics.',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 