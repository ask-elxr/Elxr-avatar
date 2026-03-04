# Build stage
FROM node:20-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg imagemagick unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg imagemagick unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/config ./config
COPY --from=builder /app/drizzle.config.ts ./

EXPOSE 5000

CMD ["npm", "run", "start"]
