#!/bin/bash

echo "🚀 Migrating to Firebase..."

# Step 1: Update package.json scripts
echo "📝 Updating package.json scripts..."
npm pkg set scripts.deploy="firebase deploy"
npm pkg set scripts.build="next build"
npm pkg delete scripts.deploy  # Remove vercel deploy

# Step 2: Update dependencies
echo "📦 Updating dependencies..."
npm uninstall @vercel/blob @vercel/postgres @next-auth/prisma-adapter prisma @prisma/client
npm install firebase-admin firebase-functions

# Step 3: Update environment variables
echo "🔧 Updating environment variables..."
cat > .env.local << EOF
# Firebase Configuration (replace with your actual values)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=translation-461511.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=translation-461511
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=translation-461511.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK
FIREBASE_ADMIN_PROJECT_ID=translation-461511
FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account@translation-461511.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----"

# Google API
GOOGLE_API_KEY=your_google_api_key

# Stripe (unchanged)
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret
EOF

# Step 4: Enable Firebase services
echo "🔥 Enabling Firebase services..."
firebase projects:list
firebase use translation-461511

# These require manual setup in Firebase Console:
echo "⚠️  Please enable these services in Firebase Console:"
echo "   1. Go to https://console.firebase.google.com/project/translation-461511"
echo "   2. Enable Authentication (with Google provider)"
echo "   3. Enable Firestore Database"
echo "   4. Enable Storage"

# Step 5: Deploy
echo "🚀 Ready to deploy!"
echo "Run: firebase deploy"

echo "✅ Migration setup complete!" 