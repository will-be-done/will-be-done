# Stage 1: Build the Vite application using pnpm
FROM node:20-alpine AS builder
# Set the working directory
WORKDIR /app
# Install pnpm globally
RUN npm install -g pnpm
# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/hyperdb/package.json ./apps/hyperdb/
COPY apps/slices/package.json ./apps/slices/
# Install dependencies using pnpm
# --frozen-lockfile ensures dependencies are installed exactly as specified in the lockfile
RUN pnpm install --frozen-lockfile
# Copy the rest of the application source code
COPY . .
# Build the application using pnpm
# Assumes your build script is named "build" in package.json
RUN pnpm --filter ./apps/web run build

# Stage 2: Create Bun runtime image with Debian base
FROM oven/bun:debian AS runner
WORKDIR /app

# Install whisper-cpp dependencies with Debian packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    make \
    g++ \
    git \
    cmake \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Build whisper.cpp matching host environment (Debian-based)
RUN git clone https://github.com/ggerganov/whisper.cpp.git && \
    cd whisper.cpp && \
    echo "Building whisper.cpp with conservative flags on Debian..." && \
    export CFLAGS="-march=x86-64 -mtune=generic" && \
    export CXXFLAGS="-march=x86-64 -mtune=generic" && \
    cmake -B build && \
    cmake --build build --config Release -j $(nproc) && \
    echo "Built binaries:" && \
    ls -la build/bin/ && \
    ldd build/bin/whisper-cli && \
    ln -s /app/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli

ENV LD_LIBRARY_PATH="/app/whisper.cpp/build/ggml/src:/app/whisper.cpp/build/src:$LD_LIBRARY_PATH"

# Copy the API files
COPY --from=builder /app/apps/hyperdb /app/apps/hyperdb
COPY --from=builder /app/apps/slices /app/apps/slices
COPY --from=builder /app/apps/api /app/apps/api
# Copy the built static files to the public directory
COPY --from=builder /app/apps/web/dist /app/apps/api/public

# Copy package files and install production dependencies for API
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
RUN bun install -g pnpm && pnpm install --prod 

# Expose port 8080
EXPOSE 3000

# Start Bun server
CMD ["bun", "run", "/app/apps/api/src/start.ts"]
