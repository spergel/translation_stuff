import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5D4037',
}

export const metadata: Metadata = {
  title: 'Pricing - AI PDF Translator',
  description: 'Choose the perfect plan for your document translation needs.',
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 