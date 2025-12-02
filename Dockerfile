# Use Node.js LTS
FROM node:18-slim

# Install OpenSSL for Prisma (required for database connections)
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies (but keep @prisma/client)
RUN npm prune --production

# Use Baileys for production (database-backed sessions)
ENV USE_BAILEYS=true
ENV NODE_ENV=production

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "dist/server.js"]
