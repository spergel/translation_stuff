/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'pdf2pic', 'canvas']
  },
  env: {
    // Map Firebase Functions config to environment variables
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'https://translation-461511.web.app',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  },
  webpack: (config, { isServer }) => {
    // Handle canvas and other problematic packages
    if (isServer) {
      config.externals.push({
        'utf-8-validate': 'commonjs utf-8-validate',
        'bufferutil': 'commonjs bufferutil',
        'canvas': 'commonjs canvas',
      })
    }

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    return config
  },
  images: {
    domains: ['lh3.googleusercontent.com'], // Allow Google profile images
  },
  // Disable static optimization for API routes with dynamic behavior
  trailingSlash: false,
  poweredByHeader: false,
  compress: true,
  
  // Handle PDF.js worker files
  async headers() {
    return [
      {
        source: '/js/pdf.worker.min.js',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy', 
            value: 'same-origin',
          },
        ],
      },
    ]
  },

  // Redirect configuration
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/signin',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig 