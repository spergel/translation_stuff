# TODO: Account System, Stripe Integration & File Storage

## Current Status
- ✅ Working PDF translation with Gemini AI
- ✅ Authentication system with NextAuth.js and database
- ✅ Beautiful warm, scholarly design system implemented
- ✅ Prisma + Neon PostgreSQL database working
- ✅ User management with tier system and .edu detection
- ✅ Header, Dashboard, and core UI components
- ✅ **COMPLETED**: Guest translation (no account required) with account prompts
- ✅ **COMPLETED**: File uploads connected to user accounts when signed in
- ✅ **COMPLETED**: Document metadata stored in database for authenticated users
- ✅ **COMPLETED**: Usage tracking and limits enforcement for authenticated users
- ✅ **COMPLETED**: Dashboard shows real documents from database
- ✅ **COMPLETED**: File storage in Vercel Blob with proper organization
- ✅ **COMPLETED**: Translation results stored persistently
- ✅ **COMPLETED**: Document thumbnails and viewer
- 🔄 **CURRENT**: Stripe integration and subscription management

---

## Phase 1: Authentication & Database Setup ✅ COMPLETED

### 1.1 Authentication System ✅
- [x] Install and configure NextAuth.js
- [x] Add Google OAuth provider
- [ ] Add GitHub OAuth provider (optional)
- [x] Create login/logout components
- [ ] Add protected routes middleware
- [x] Create auth context/hooks

### 1.2 Database Setup ✅
- [x] Choose database (Neon PostgreSQL)
- [x] Set up database connection
- [x] Create database schemas (Prisma models)
- [x] Generate Prisma client
- [x] Create database helper functions
- [x] Fix Prisma client import path issues

### 1.3 User Account Pages ✅
- [x] Create `/dashboard` route
- [x] Account settings page (basic dashboard)
- [x] Usage statistics component
- [x] Storage quota display
- [x] Beautiful Header with user info and tier badges

### 1.4 Design System ✅
- [x] Create comprehensive design system document
- [x] Implement warm, scholarly color palette
- [x] Update global CSS with design variables
- [x] Apply design system to all components
- [x] Responsive design considerations

---

## Phase 2: Guest-Friendly Translation + Account Integration ✅ COMPLETED

### 2.1 Guest Translation System ✅
- [x] **COMPLETED**: Allow translation without authentication
- [x] **COMPLETED**: Limited access for anonymous users (1 file, 5MB max)
- [x] **COMPLETED**: Show account benefits and sign-up prompts
- [x] **COMPLETED**: Save prompt after translation starts for guests

### 2.2 Authentication-Connected Storage ✅
- [x] **COMPLETED**: Connect authentication to file upload process
- [x] **COMPLETED**: Save uploaded documents to database with user association
- [x] **COMPLETED**: Store file metadata (name, size, upload date, status)
- [x] **COMPLETED**: Update document status during processing
- [x] **COMPLETED**: Document library shows real user documents
- [x] **COMPLETED**: Storage limit checking before upload
- [x] **COMPLETED**: Usage tracking and tier enforcement
- [x] **COMPLETED**: Document deletion from database

### 2.3 Enhanced UX ✅
- [x] **COMPLETED**: Anonymous users can translate immediately
- [x] **COMPLETED**: Signed-in users get documents auto-saved
- [x] **COMPLETED**: Dashboard shows saved translations with status
- [x] **COMPLETED**: Real-time progress tracking in database
- [x] **COMPLETED**: Tier-based limits with clear messaging

---

## Phase 3: File Storage & Persistent Results ✅ COMPLETED

### 3.1 File Storage System ✅ COMPLETED
- [x] **COMPLETED**: Store original PDF files in Vercel Blob
- [x] **COMPLETED**: Store translated PDF/HTML results in Vercel Blob
- [x] **COMPLETED**: Update database with file URLs
- [x] **COMPLETED**: Implement download functionality from stored files
- [x] **COMPLETED**: Create file upload API with user folders
- [x] **COMPLETED**: File cleanup/deletion handling from blob storage
- [x] **COMPLETED**: Generate document thumbnails

### 3.2 Translation Result Persistence ✅ COMPLETED
- [x] **COMPLETED**: Save translation results (page-by-page) to blob storage
- [x] **COMPLETED**: Store page-level translation data as JSON
- [x] **COMPLETED**: Real-time status updates during processing
- [x] **COMPLETED**: Error handling and retry logic

### 3.3 Download System ✅ COMPLETED
- [x] **COMPLETED**: Connect dashboard download buttons to real files
- [x] **COMPLETED**: Implement secure file download endpoints
- [x] **COMPLETED**: File preview functionality (document viewer modal)
- [x] **COMPLETED**: Document thumbnails in dashboard
- [x] **COMPLETED**: Search and filtering in document library

---

## Phase 4: Stripe Integration (🔄 CURRENT PHASE)

### 4.1 Stripe Setup 🔄 IN PROGRESS
- [x] **COMPLETED**: Install Stripe SDK
- [x] **COMPLETED**: Create subscription products and pricing structure:
  - **Free**: 5 documents, 5GB storage, 30-day retention
  - **Basic**: 50 documents, 5GB storage, 1-year retention ($9.99/month)
  - **Pro**: 500 documents, 25GB storage, unlimited retention ($29.99/month)
  - **Enterprise**: Unlimited documents, 50GB storage, unlimited retention ($99.99/month)
- [x] **COMPLETED**: Beautiful pricing page with upgrade flow
- [x] **COMPLETED**: Implement checkout API endpoint
- [ ] **TODO**: Configure Stripe webhook endpoints (webhooks created, needs testing)
- [ ] **TODO**: Create Stripe products and prices in Stripe Dashboard
- [ ] **TODO**: Set environment variables for price IDs

### 4.2 Subscription Management 🔄 PARTIAL
- [x] **COMPLETED**: Subscription status tracking in database
- [x] **COMPLETED**: Pricing page with plan comparison
- [x] **COMPLETED**: Upgrade prompt component
- [ ] **TODO**: Billing/subscription management pages
- [ ] **TODO**: Usage-based upgrade prompts in upload flow
- [x] **COMPLETED**: Stripe webhook handlers (created, needs testing)

### 4.3 Usage Limits & Enforcement ✅ COMPLETED
- [x] **COMPLETED**: Check storage limits before upload
- [x] **COMPLETED**: Check document count limits
- [x] **COMPLETED**: Block operations when limits exceeded
- [x] **COMPLETED**: Show usage progress in UI
- [ ] **TODO**: Monthly usage reset logic

---

## Phase 5: Advanced Features

### 5.1 Enhanced Document Management
- [ ] Folder organization system
- [ ] Bulk operations (delete, move, export)
- [ ] File tagging and favorites
- [ ] Document sharing with expiring links
- [ ] Export library as ZIP

### 5.2 Enhanced Translation Features
- [ ] Re-translate existing documents
- [ ] Compare different language versions
- [ ] Batch translate multiple files
- [ ] Translation history/versioning
- [ ] Custom translation templates

### 5.3 Analytics & Monitoring
- [ ] User analytics dashboard
- [ ] Translation success rates
- [ ] Popular languages/document types
- [ ] Performance monitoring

---

## Phase 6: UI/UX Improvements

### 6.1 Update Main UI
- [x] Add header with login/account info
- [x] Beautiful warm, scholarly design system
- [x] **NEW**: Guest-friendly main page with sign-up prompts
- [x] **NEW**: Account benefits clearly communicated
- [x] Show current usage/limits in upload area
- [x] Progressive loading states

### 6.2 Mobile Optimization
- [ ] Responsive document library
- [ ] Mobile upload flow
- [ ] Touch-friendly file management

### 6.3 Accessibility
- [ ] ARIA labels for screen readers
- [ ] Keyboard navigation
- [ ] Color contrast compliance

---

## Phase 7: Testing & Polish

### 7.1 Testing
- [ ] Unit tests for core functions
- [ ] Integration tests for API routes
- [ ] E2E tests for subscription flows
- [ ] Test .edu email handling
- [ ] Load testing for file uploads

### 7.2 Documentation
- [ ] Update README with account features
- [ ] API documentation
- [ ] User guide/help center
- [ ] Update deployment guide

### 7.3 Performance Optimization
- [ ] Image optimization
- [ ] Lazy loading for document library
- [ ] CDN optimization for files
- [ ] Database query optimization

---

## Technical Dependencies ✅ INSTALLED

```json
{
  "dependencies": {
    "next-auth": "^4.24.5", // ✅ INSTALLED
    "@next-auth/prisma-adapter": "^1.0.7", // ✅ INSTALLED
    "prisma": "^5.7.1", // ✅ INSTALLED
    "@prisma/client": "^5.7.1", // ✅ INSTALLED
    "stripe": "^14.9.0", // TODO: For Phase 4
    "@vercel/postgres": "^0.5.1", // ✅ INSTALLED
    "zustand": "^4.4.7", // ✅ INSTALLED
    "react-query": "^3.39.3", // TODO: For Phase 3
    "zod": "^3.25.42", // ✅ INSTALLED
    "sharp": "^0.34.2" // TODO: For thumbnails
  }
}
```

---

## Environment Variables Status

```bash
# Authentication ✅ CONFIGURED
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=c695ef49f108b6024452501e5333d569a49d5a6985102bfcfccd0eca42acdbc3
GOOGLE_CLIENT_ID=your-google-client-id (TODO: ADD)
GOOGLE_CLIENT_SECRET=your-google-client-secret (TODO: ADD)

# Database ✅ CONFIGURED  
POSTGRES_URL=postgresql://neondb_owner:npg_7rZnOqhQrBJMbBYX6NJq0mWS6F9KWFfM@ep-withered-frog-a53ufbx1.us-east-2.aws.neon.tech/neondb?sslmode=require
POSTGRES_URL_NON_POOLING=postgresql://neondb_owner:npg_7rZnOqhQrBJMbBYX6NJq0mWS6F9KWFfM@ep-withered-frog-a53ufbx1.us-east-2.aws.neon.tech/neondb?sslmode=require

# Existing ✅ CONFIGURED
GOOGLE_API_KEY=your_google_api_key_here (TODO: ADD)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_token_here (TODO: ADD)

# Stripe (TODO - Phase 4)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Email (optional - for notifications) (TODO)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

---

## 🚀 IMMEDIATE NEXT STEPS - Phase 3.1 Priority

### **STEP 1: Implement File Storage in Vercel Blob** (THIS WEEK)
1. **Store original PDF files** in organized blob structure
2. **Save translation results** (PDF/HTML) to blob storage
3. **Update database** with file URLs for downloads
4. **Connect dashboard downloads** to actual stored files

### **STEP 2: Enhanced Download System** (THIS WEEK)  
1. **Secure download endpoints** with user authentication
2. **File preview functionality** 
3. **Bulk download options**
4. **File cleanup** when documents are deleted

### **STEP 3: Result Persistence** (NEXT WEEK)
1. **Store individual page translations** in database
2. **Background processing** for large documents
3. **Real-time status updates** via WebSocket/polling
4. **Error handling and retry** logic

## What We Have Working Now:
- ✅ **Guest translation** - Anyone can translate without signing up
- ✅ **Smart account prompts** - Encourages sign-up to save work
- ✅ **Full authentication system** - Google OAuth with database
- ✅ **Document metadata tracking** - Status, progress, user association
- ✅ **Tier-based limits** - Storage and document count enforcement
- ✅ **Real dashboard** - Shows actual user documents from database
- ✅ **Usage statistics** - Real-time storage and document count display

## What's Blocking Us:
1. **Google API keys** needed in `.env` for full authentication
2. **Vercel Blob token** needed for file storage
3. **File storage implementation** for persistent downloads
4. **Translation result storage** in blob + database 