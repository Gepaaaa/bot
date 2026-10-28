FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install ffmpeg (animated WebP stickers, video PTV, Opus Voice Note, audio effects)
# and fonts/fontconfig (Sharp SVG sticker rendering for .qc, .iqc, .brat, .meme)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      fontconfig \
      fonts-liberation \
      fonts-noto-color-emoji && \
    fc-cache -fv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create /data directory so persistent Fly.io Volume mounts cleanly
RUN mkdir -p /data

# Copy package manifests and install dependencies (--legacy-peer-deps resolves Vite 8 vs esbuild peer check)
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy project source and build frontend assets
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

EXPOSE 8080

# Run tsx directly without npx wrapper (saves ~90 MB RAM to prevent OOM restarts)
CMD ["./node_modules/.bin/tsx", "server.ts"]
