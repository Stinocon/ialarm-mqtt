# Multi-stage build for optimization
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S ialarm -u 1001 -G nodejs

# Create app directory
WORKDIR /usr/src/app

# Copy built application from builder stage
COPY --from=builder --chown=ialarm:nodejs /usr/src/app/node_modules ./node_modules

# Copy application source
COPY --chown=ialarm:nodejs . .

# Create necessary directories
RUN mkdir -p /config /logs && \
    chown -R ialarm:nodejs /config /logs

# Switch to non-root user
USER ialarm

# Expose web interface port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "bin/ialarm-mqtt", "-c", "/config"]

# Labels for better container management
LABEL maintainer="ialarm-mqtt team"
LABEL description="iAlarm MQTT Bridge with Web Interface"
LABEL version="0.12.1"
LABEL org.opencontainers.image.source="https://github.com/Stinocon/ialarm-mqtt"