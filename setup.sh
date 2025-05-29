#!/bin/bash

echo "🚀 PDF Translator Setup Script"
echo "==============================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    echo "   Please update Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create environment file
if [ ! -f ".env.local" ]; then
    echo "📝 Creating environment file..."
    cp env.example .env.local
    echo "✅ Created .env.local file"
    echo ""
    echo "⚠️  IMPORTANT: You need to add your Google API key to .env.local"
    echo "   1. Get your API key from: https://makersuite.google.com/app/apikey"
    echo "   2. Edit .env.local and replace 'your_google_api_key_here' with your actual key"
    echo ""
else
    echo "✅ .env.local already exists"
fi

# Check if API key is set
if grep -q "your_google_api_key_here" .env.local 2>/dev/null; then
    echo "⚠️  Please set your Google API key in .env.local before running the app"
else
    echo "✅ API key appears to be configured"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure your Google API key is set in .env.local"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "For deployment to Vercel:"
echo "1. Run 'npm install -g vercel' to install Vercel CLI"
echo "2. Run 'vercel' to deploy"
echo "3. See DEPLOYMENT.md for detailed instructions"
echo ""
echo "Happy translating! 📚✨" 