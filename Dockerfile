FROM node:20-slim

# Install system dependencies for media processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg imagemagick unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend (Vite) and backend (esbuild)
RUN npm run build

# Expose port (Railway sets PORT env var)
EXPOSE 5000

CMD ["npm", "run", "start"]
