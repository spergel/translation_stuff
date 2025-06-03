# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Ensure PDF.js worker files are in the correct location
RUN mkdir -p /app/dist && \
    cp /app/node_modules/pdfjs-dist/build/pdf.worker.js /app/dist/ && \
    cp /app/node_modules/pdfjs-dist/build/pdf.worker.min.js /app/dist/

# Set environment variables
ENV NODE_ENV=production

# Start the worker
CMD ["node", "dist/index.js"]