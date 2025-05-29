# Deployment Guide

This guide will help you deploy the PDF Translator application to Vercel.

## Prerequisites

1. **Node.js 18+** installed on your machine
2. **Google Gemini API Key** - Get one from [Google AI Studio](https://makersuite.google.com/app/apikey)
3. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
4. **Git repository** - Your code should be in a Git repository (GitHub, GitLab, etc.)

## Step-by-Step Deployment

### 1. Prepare Your Environment

First, make sure your application works locally:

```bash
# Install dependencies
npm install

# Copy environment file
cp env.example .env.local

# Add your Google API key to .env.local
echo "GOOGLE_API_KEY=your_actual_api_key_here" > .env.local

# Test locally
npm run dev
```

Visit `http://localhost:3000` and test the upload functionality.

### 2. Deploy to Vercel

#### Option A: Deploy via Vercel CLI (Recommended)

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (run from your project root)
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name? (accept default or customize)
# - Directory? ./ (current directory)
```

#### Option B: Deploy via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your Git repository
4. Configure project settings:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: `npm run build`
   - Output Directory: (leave default)

### 3. Configure Environment Variables

After deployment, you need to add your environment variables:

#### Via Vercel Dashboard:
1. Go to your project dashboard
2. Click "Settings" tab
3. Click "Environment Variables"
4. Add: `GOOGLE_API_KEY` with your actual API key
5. Set environment to "Production" (and "Preview" if needed)

#### Via Vercel CLI:
```bash
# Add environment variable
vercel env add GOOGLE_API_KEY

# When prompted:
# - Enter the value: your_actual_api_key_here
# - Select environments: Production (and Preview if needed)
```

### 4. Redeploy with Environment Variables

After adding environment variables, redeploy:

```bash
# Redeploy to production
vercel --prod
```

Or trigger a redeploy from the Vercel dashboard.

### 5. Test Your Deployment

1. Visit your deployed URL (provided by Vercel)
2. Test file upload with a small PDF
3. Check that translation works
4. Verify download functionality

## Configuration Files

### vercel.json
The `vercel.json` file configures:
- Function timeouts (5 minutes for translation, 1 minute for PDF generation)
- Environment variable references

### next.config.js
Configures:
- Large file upload support (100MB)
- External packages for server components
- Webpack configuration for canvas/sharp

## Troubleshooting

### Common Issues

#### 1. "Module not found" errors
- Ensure all dependencies are in `package.json`
- Run `npm install` locally to verify
- Check that TypeScript types are installed

#### 2. API timeout errors
- Translation API has 5-minute timeout (configurable in `vercel.json`)
- Large PDFs may need longer processing time
- Consider implementing pagination for very large documents

#### 3. Environment variable not found
- Verify `GOOGLE_API_KEY` is set in Vercel dashboard
- Check that variable name matches exactly
- Redeploy after adding environment variables

#### 4. File upload failures
- Check file size limits (100MB max)
- Verify PDF format is supported
- Check browser console for errors

### Debugging

#### Check Function Logs
```bash
# View real-time logs
vercel logs --follow

# View logs for specific deployment
vercel logs [deployment-url]
```

#### Local Development
```bash
# Run with debug output
DEBUG=* npm run dev

# Check API routes specifically
curl -X POST http://localhost:3000/api/translate \
  -F "file=@test.pdf" \
  -F "targetLanguage=spanish"
```

## Performance Optimization

### 1. Function Configuration
- Translation API: 5-minute timeout for large documents
- PDF Generation: 1-minute timeout (usually sufficient)

### 2. File Size Limits
- Current limit: 100MB per file
- Page limit: 100 pages per document
- Adjust in code if needed for your use case

### 3. Caching
- Static assets are automatically cached by Vercel
- API responses are not cached (dynamic content)

## Security Considerations

### 1. API Key Protection
- Never commit API keys to version control
- Use environment variables only
- Rotate keys periodically

### 2. File Upload Security
- Only PDF files are accepted
- File size limits prevent abuse
- Files are processed in memory (not stored permanently)

### 3. Rate Limiting
- Consider implementing rate limiting for production use
- Google Gemini API has its own rate limits

## Monitoring

### 1. Vercel Analytics
- Enable in project settings for usage insights
- Monitor function execution times
- Track error rates

### 2. Error Tracking
- Consider adding Sentry or similar for error tracking
- Monitor API response times
- Set up alerts for failures

## Scaling Considerations

### 1. Concurrent Processing
- Current implementation processes pages sequentially
- Consider parallel processing for better performance
- Be mindful of API rate limits

### 2. Database Integration
- Current version doesn't persist data
- Consider adding database for:
  - Translation history
  - User management
  - Usage analytics

### 3. CDN and Caching
- Vercel provides global CDN automatically
- Consider caching translated content
- Implement client-side caching for better UX

## Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review Vercel function logs
3. Test locally with the same inputs
4. Check Google Gemini API status
5. Create an issue in the repository with:
   - Error messages
   - Steps to reproduce
   - Browser/environment details 