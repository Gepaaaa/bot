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

# Copy package manifests and install dependencies (--legacy-peer-deps resolves Vite 8 vs esbuild peer check)
COPY package*.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy project source and build frontend assets
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Fly.io default internal_port is 8080 (server.ts still falls back to 3000 locally when PORT is unset)
ENV PORT=8080

EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
