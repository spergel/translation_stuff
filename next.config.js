/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel serverless function optimizations
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'pdf-lib', 'canvas', 'pdfjs-serverless']
  },
  
  // Increase memory limit for serverless functions processing large PDFs
  serverRuntimeConfig: {
    maxDuration: 300, // 5 minutes max for PDF processing
    redisConnectionString: process.env.REDIS_CONNECTION_STRING,
  },
  
  webpack: (config, { isServer }) => {
    // Handle PDF.js worker and canvas dependencies
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      }
    }
    
    // For server-side, handle PDF.js properly
    if (isServer) {
      config.externals = config.externals || []
      
      // Don't externalize PDF.js related modules
      config.externals.push({
        'pdfjs-dist/build/pdf.worker.js': 'commonjs pdfjs-dist/build/pdf.worker.js',
        'pdfjs-dist/legacy/build/pdf.worker.js': 'commonjs pdfjs-dist/legacy/build/pdf.worker.js'
      })
      
      // Handle canvas
      if (!config.externals.includes('canvas')) {
        config.externals.push('canvas')
      }
      
      // Optimize for serverless function size and performance
      config.optimization = {
        ...config.optimization,
        // Don't split chunks for serverless functions
        splitChunks: false,
      }
    }
    
    // Copy PDF.js worker files to the output directory
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]',
      },
    })
    
    return config
  },
}

module.exports = nextConfig 