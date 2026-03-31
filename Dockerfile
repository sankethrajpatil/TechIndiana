### Builder stage: install deps and build frontend + bundle server
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files first for install caching
COPY package.json package-lock.json* ./

# Install dependencies (try npm ci, fall back to npm install)
RUN npm ci --prefer-offline --no-audit --no-fund || npm install

# Copy the rest of the repository and run the build (Vite + server bundle)
COPY . .
RUN npm run build

### Runner stage: smaller image with production artifacts only
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the built app and node_modules from the builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080

# Cloud Run will supply PORT; the server uses process.env.PORT || 8080
CMD ["node", "dist/server.cjs"]
