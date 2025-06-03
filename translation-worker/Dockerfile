# Build stage
FROM node:20-slim AS builder

# Install ALL system dependencies needed for various packages
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    poppler-utils \
    # Sharp dependencies
    libvips-dev \
    # Additional build tools
    pkg-config \
    # Redis client dependencies
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables for various packages
ENV PDFJS_SERVERLESS_LEGACY=true
ENV PDFJS_SERVERLESS_PLATFORM=node
# DO NOT SET NODE_ENV=production HERE for the builder stage
# Sharp environment variables
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=true
# Build optimization
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
# This will install TypeScript from devDependencies
RUN npm install && \
    npm cache clean --force

# Copy source
COPY . .

# Build TypeScript using npm script (which runs "tsc")
RUN npm run build

# Production stage
FROM node:20-slim

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    # Sharp runtime dependencies
    libvips \
    # Redis client runtime dependencies
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables for PRODUCTION
ENV NODE_ENV=production
ENV PDFJS_SERVERLESS_LEGACY=true
ENV PDFJS_SERVERLESS_PLATFORM=node
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=true

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
# We need to copy node_modules from the builder stage that has ALL dependencies
# then prune for production.
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
RUN npm prune --production

# Start the worker

# CMD ["node", "dist/index.js"] 
CMD ["node", "-e", "console.log('HELLO FROM CONTAINER')"]