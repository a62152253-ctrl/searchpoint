# ==============================================================================
# PROJECT NEXUS - Production Multi-Stage Dockerfile
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy project source files
COPY . .

# Compile Vite frontend into dist/
RUN npm run build

# ==============================================================================
# Production Runtime Image
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server and built frontend from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/package.json ./package.json

# Persistent storage volume for sqlite, auth vault, crypto orders, licenses
VOLUME ["/app/server/storage"]

EXPOSE 3001

CMD ["node", "server/server.cjs"]
