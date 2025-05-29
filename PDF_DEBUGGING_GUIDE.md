# PDF Image Extraction Debugging Guide

## Common Issues and Solutions

### Issue 1: PDF.js Worker Errors
**Symptoms:** Console errors like "pdf.js:1927:1" or worker loading failures
**Solutions:**
1. Check if PDF.js worker files are accessible at `/js/pdf.worker.min.mjs`
2. Use the "Test PDF.js" button to verify worker setup
3. Check browser console for specific worker errors

### Issue 2: Empty Canvas Images (Server-side)
**Symptoms:** Page images show as blank/white canvas despite having content
**Root Causes:**
- Font loading issues in serverless environment
- PDF contains complex graphics that don't render properly
- Canvas context issues

**Solutions:**
1. **Font Issues:** Disabled external font loading in server config
2. **Complex Graphics:** Added fallback rendering with simplified settings
3. **Canvas Validation:** Added minimum size checks to detect empty canvases

### Issue 3: Client-side Extraction Failing
**Symptoms:** "Extracted 0 images" in console
**Solutions:**
1. **PDF.js Configuration:** Added more robust PDF loading options:
   - `disableFontFace: true`
   - `disableRange: true`
   - `disableStream: true`
   - `disableAutoFetch: true`

2. **Multiple Fallback Methods:**
   - Primary: Advanced PDF.js with full configuration
   - Fallback 1: Alternative extraction with simpler settings
   - Fallback 2: Simple fallback with basic configuration

## Testing Steps

### 1. Test PDF.js Setup
Click the "Test PDF.js" button in the UI to verify:
- PDF.js library loads correctly
- Worker file is accessible
- Canvas functionality works
- A red test square should appear briefly in top-right corner

### 2. Check Console Logs
Monitor browser console for:
- `📄 PDF.js worker configured: [worker_url]`
- `✅ Page X extracted (Y chars)` for successful extractions
- `⚠️ Error extracting page X:` for failures

### 3. Verify Server Logs
Server-side extraction logs:
- `🖼️ Extracting image for page X using pdfjs-serverless and canvas...`
- `✅ Successfully extracted image for page X (Y chars)`
- `⚠️ Generated image for page X is very small (Y chars), might be empty`

## Configuration Details

### Client-side PDF.js Config
```javascript
{
  data: uint8Array,
  useWorkerFetch: false,
  isEvalSupported: false,
  useSystemFonts: true,
  disableFontFace: true,
  disableRange: true,
  disableStream: true,
  disableAutoFetch: true,
  verbosity: 0,
  cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'
}
```

### Server-side PDF.js Config
```javascript
{
  data: imageExtractionData,
  useSystemFonts: true,
  disableFontFace: true,
  isEvalSupported: false,
  disableRange: true,
  disableStream: true,
  disableAutoFetch: true,
  verbosity: 0,
  standardFontDataUrl: undefined,
  cMapUrl: undefined,
  cMapPacked: false
}
```

## Troubleshooting Specific PDF Types

### Complex PDFs with Graphics
- Server-side extraction may fail, client-side usually works better
- Added alternative rendering methods for problematic pages

### Password-Protected PDFs
- Added empty password attempt in alternative extraction method
- May require user password input for full extraction

### Large PDFs
- Batch processing handles large files
- Individual page extraction prevents memory issues

## Performance Optimizations

1. **Client Images Priority:** Server checks for pre-extracted client images first
2. **Scale Adjustment:** Uses 2.0 scale for quality but can fallback to 1.0
3. **Canvas Validation:** Minimum 5000 char threshold to detect meaningful content
4. **Error Recovery:** Multiple fallback methods prevent complete failure

## Debug Commands

### Browser Console Tests
```javascript
// Test PDF.js availability
await import('pdfjs-dist')

// Check worker
console.log(pdfjsLib.GlobalWorkerOptions.workerSrc)

// Test canvas
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
```

### Useful Log Patterns
- `📸 Using pre-extracted client image` - Client extraction worked
- `🔄 Attempting alternative rendering` - Server trying fallback method
- `⚠️ Generated image...is very small` - Possible empty canvas
- `❌ Client-side extraction failed` - Client PDF.js failed entirely

## When to Use Different Approaches

1. **Client-side extraction is preferred** for:
   - PDFs with complex graphics
   - PDFs with embedded fonts
   - Better browser PDF.js support

2. **Server-side extraction is backup** for:
   - When client fails
   - Consistent processing
   - Server-side only workflows

3. **Text-only fallback** when:
   - Both image extractions fail
   - Performance is critical
   - Images aren't essential 