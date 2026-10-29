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

# Create writable /data directory for persistent volumes or non-root containers
RUN mkdir -p /data && chmod 777 /data

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy project source, build frontend assets, and bundle server into pure ESM JS
# (eliminates ~120 MB tsx/TypeScript runtime RAM overhead on 512 MB free cloud plans)
COPY . .
RUN npm run build && \
    ./node_modules/.bin/esbuild server.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --packages=external \
      --outfile=server.mjs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--max-old-space-size=384", "server.mjs"]
