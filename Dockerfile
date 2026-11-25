# ==============================================================================
# Pulse Messenger — Production Dockerfile
# Optimized for performance, minimal image size (~140MB), security and zero-downtime
# ==============================================================================

FROM node:20-alpine AS base

# Install curl for Docker healthcheck and dumb-init for PID 1 signal forwarding
RUN apk add --no-cache curl dumb-init

WORKDIR /app

# Ensure production environment
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# 1. Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# 2. Copy application source code
COPY server/ ./server/
COPY public/ ./public/
COPY data/ ./data/
COPY uploads/ ./uploads/

# 3. Setup permissions and directories for persistent mounts
RUN mkdir -p /app/data /app/uploads && \
    chown -R node:node /app

# Run as non-privileged user for container security
USER node

# Expose HTTP/WebSocket port and Cluster Bus port
EXPOSE 3000 6380

# Built-in Container Healthcheck
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Launch using dumb-init to handle SIGTERM/SIGINT cleanly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server/server.js"]
