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

# Install dependencies using pnpm
# --frozen-lockfile ensures dependencies are installed exactly as specified in the lockfile
RUN pnpm install --frozen-lockfile

# Copy the rest of the application source code
COPY . .

# Build the application using pnpm
# Assumes your build script is named "build" in package.json
RUN pnpm --filter ./apps/web run build

# Stage 2: Serve the static files with Nginx
FROM nginx:stable-alpine

# Copy the build output from the builder stage to Nginx's web root
# Vite typically builds to a 'dist' folder. Adjust if yours is different.
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy a custom Nginx configuration file (optional but recommended for SPAs)
COPY .deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"]

