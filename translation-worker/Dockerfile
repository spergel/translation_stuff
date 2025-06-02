# Build stage
FROM node:20-slim AS builder

# Install system dependencies for sharp and pdf-poppler
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables for pdfjs-serverless
ENV PDFJS_SERVERLESS_LEGACY=true
ENV PDFJS_SERVERLESS_PLATFORM=node
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev) for building
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PDFJS_SERVERLESS_LEGACY=true
ENV PDFJS_SERVERLESS_PLATFORM=node

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Start the worker
CMD ["node", "dist/index.js"] 