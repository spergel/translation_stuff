# Build stage
FROM node:20-slim AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    poppler-utils \
    libvips-dev \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libvips \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy built files and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
RUN npm prune --production

# Start the worker
CMD ["node", "dist/index.js"]