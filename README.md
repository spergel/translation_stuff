# PDF Translation Service

A modern Next.js application for translating PDF documents using Google's Gemini AI, with support for multiple output formats and batch processing.

## 🚀 Features

- **Multi-file Upload**: Drag & drop multiple PDF files for simultaneous processing
- **Real-time Progress**: Live progress tracking with detailed status updates
- **Multiple Output Formats**: 8+ different HTML export formats including side-by-side, transcription, and complete analysis
- **Tier-based Processing**: Support for different subscription tiers with varying capabilities
- **Batch Processing**: Concurrent page processing for faster translation (paid tiers)
- **Image Extraction**: Extract page images from PDFs
- **Responsive UI**: Modern, clean interface with Tailwind CSS

## 📁 Project Structure

```
app/
├── components/           # Reusable UI components
│   ├── FileUpload.tsx   # Drag & drop file upload component
│   ├── JobQueue.tsx     # Translation job queue with progress tracking
│   └── TranslationSettings.tsx  # Settings panel for language/tier selection
├── hooks/               # Custom React hooks
│   └── useTranslationJobs.ts    # Job management logic
├── types/               # TypeScript type definitions
│   └── translation.ts   # Core interfaces and types
├── utils/               # Utility functions
│   ├── htmlGenerators.ts        # HTML export format generators
│   └── pdfUtils.ts      # PDF processing utilities
├── api/                 # API routes
│   └── translate/       # Translation endpoint
└── page.tsx            # Main application page (simplified)
```

## 🛠️ Architecture Improvements

### Before Refactoring
- **Single monolithic file**: 933 lines in `page.tsx`
- **Mixed concerns**: UI, business logic, and utilities all in one place
- **Hard to maintain**: Difficult to find and modify specific functionality
- **Poor reusability**: No component separation

### After Refactoring
- **Modular components**: Separated into logical, reusable components
- **Custom hooks**: Business logic extracted into `useTranslationJobs` hook
- **Type safety**: Centralized TypeScript definitions
- **Utility separation**: HTML generators and PDF utils in dedicated files
- **Clean main page**: Only 246 lines focused on layout and coordination

## 🎯 Component Breakdown

### `FileUpload.tsx`
- Handles drag & drop file uploads
- Validates PDF file types
- Shows upload states and feedback

### `JobQueue.tsx`
- Displays translation jobs with progress bars
- Provides action buttons (cancel, retry, download, preview)
- Shows detailed status information and error messages

### `TranslationSettings.tsx`
- Language selection dropdown
- Subscription tier configuration
- Batch processing toggle

### `useTranslationJobs.ts`
- Manages job state and lifecycle
- Handles Server-Sent Events (SSE) for real-time updates
- Provides job manipulation functions (add, cancel, retry, remove)

## 🔧 Setup & Installation

1. **Clone the repository**
```bash
   git clone <repository-url>
   cd translation_stuff
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
   # Create .env.local file
   GOOGLE_API_KEY=your_gemini_api_key_here
```

4. **Run the development server**
```bash
npm run dev
```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## 📊 Subscription Tiers

| Tier | Max Pages | Batch Size | Concurrent Files | Processing |
|------|-----------|------------|------------------|------------|
| Free | 20 | 1 (Sequential) | 1 | Sequential |
| Basic | 100 | 3 | 2 | Batch |
| Pro | 500 | 10 | 5 | Batch |
| Enterprise | Unlimited | 20 | 10 | Batch |

## 📄 Export Formats

1. **Translation Only** - Clean translation text
2. **Original + Translation** - Side-by-side with original images
3. **Side by Side** - Original content and translation comparison
4. **Transcription + Translation** - Transcribed text with translation
5. **Complete Analysis** - Original image, transcription, and translation
6. **Original + Transcription** - Original images with transcribed text
7. **Original Image + Translation** - Simplified image and translation view

## 🔄 Translation Process

1. **File Upload**: User drops PDF files into upload area
2. **Job Creation**: Each file creates a translation job
3. **Processing**: Backend processes pages using Gemini AI
4. **Progress Updates**: Real-time progress via Server-Sent Events
5. **Completion**: Results available for preview and download

## 🎨 UI/UX Features

- **Responsive Design**: Works on desktop and mobile
- **Progress Visualization**: Animated progress bars with percentage
- **Status Indicators**: Color-coded status badges
- **Queue Management**: See all jobs and their positions
- **Error Handling**: Clear error messages with retry options
- **Preview Modal**: In-app preview of translation results

## 🚀 Performance Optimizations

- **Batch Processing**: Process multiple pages concurrently
- **Streaming Responses**: Real-time updates via SSE
- **Component Separation**: Efficient re-rendering
- **Memory Management**: Proper cleanup of abort controllers
- **Optimized Imports**: Tree-shaking friendly structure

## 🔧 Development

### Adding New Export Formats
1. Add new function to `app/utils/htmlGenerators.ts`
2. Update the format switch in `page.tsx`
3. Add new option to `JobQueue.tsx` dropdown

### Extending Job Management
1. Add new properties to `TranslationJob` interface in `types/translation.ts`
2. Update `useTranslationJobs.ts` hook with new functionality
3. Modify UI components as needed

### Adding New Components
1. Create component in `app/components/`
2. Export from component file
3. Import and use in `page.tsx` or other components

## 📝 API Reference

### POST `/api/translate`
Translates a PDF file using Gemini AI.

**Parameters:**
- `file`: PDF file (multipart/form-data)
- `targetLanguage`: Target language for translation
- `userTier`: Subscription tier (affects processing limits)
- `useBatchProcessing`: Enable batch processing (boolean)

**Response:** Server-Sent Events stream with progress updates and results

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the established patterns
4. Test thoroughly
5. Submit a pull request

## 📄 License

[Add your license information here] 