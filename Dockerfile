# Stage 1: Build the Vite application using pnpm
FROM node:24-alpine AS builder
# Set the working directory
WORKDIR /app
# Git is required for git-based pnpm dependencies.
RUN apk add --no-cache git
# Copy package.json files
COPY package.json ./
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/slices/package.json ./apps/slices/
# Install only the packages used by the web/api image. A root workspace install
# also runs install scripts for unrelated apps such as apps/desktop.
RUN corepack enable && pnpm --filter @will-be-done/web... --filter @will-be-done/api... install --frozen-lockfile
# Copy the rest of the application source code
COPY . .
# Build the application using pnpm
# Assumes your build script is named "build" in package.json
WORKDIR /app/apps/web
RUN pnpm exec vite build
WORKDIR /app

# Stage 2: Create Bun runtime image
FROM oven/bun:1.3.14-alpine AS runner
WORKDIR /app

# Copy the API files
COPY --from=builder /app/apps/slices /app/apps/slices
COPY --from=builder /app/apps/api /app/apps/api
# Copy the built static files to the public directory
COPY --from=builder /app/apps/web/dist /app/apps/api/public

# Copy package files and install production dependencies for API
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=builder /app/apps/slices/node_modules /app/apps/slices/node_modules

# Create default storage directory
RUN mkdir -p /var/lib/will-be-done/db

ENV WBD_STORAGE_PATH=/var/lib/will-be-done
ENV WBD_DB_PATH=/var/lib/will-be-done/db

EXPOSE 3000

# Start Bun server
CMD ["bun", "run", "/app/apps/api/src/start.ts"]
