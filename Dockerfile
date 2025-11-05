# Multi-stage Dockerfile for NestJS application
FROM node:24.0.2-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

USER nestjs

EXPOSE 3000

# Default entrypoint (can be overridden in docker-compose)
CMD ["node", "dist/src/notification-api/main.js"]

