# Stage 1: Build the Vite application using Bun
FROM oven/bun:alpine AS builder
# Set the working directory
WORKDIR /app
# Copy package.json files
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/hyperdb/package.json ./apps/hyperdb/
COPY apps/slices/package.json ./apps/slices/
# Copy lockfile if it exists
COPY bun.lockb* ./
# Install dependencies using Bun
RUN bun install
# Copy the rest of the application source code
COPY . .
# Build the application using Bun
# Assumes your build script is named "build" in package.json
WORKDIR /app/apps/web
RUN bun run build
WORKDIR /app

# Stage 2: Create Bun runtime image
FROM oven/bun:alpine AS runner
WORKDIR /app

# Copy the API files
COPY --from=builder /app/apps/hyperdb /app/apps/hyperdb
COPY --from=builder /app/apps/slices /app/apps/slices
COPY --from=builder /app/apps/api /app/apps/api
# Copy the built static files to the public directory
COPY --from=builder /app/apps/web/dist /app/apps/api/public

# Copy package files and install production dependencies for API
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lockb* ./
RUN bun install --production 

# Expose port 8080
EXPOSE 3000

# Start Bun server
CMD ["bun", "run", "/app/apps/api/src/start.ts"]
