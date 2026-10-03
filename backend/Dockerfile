# -----------------------------------------------------------------------------
# Dockerfile for HeatNote Backend (Node.js + SQLite)
# -----------------------------------------------------------------------------
# Builds a lightweight container running the Express API server.
# Data (SQLite DB + uploaded images) lives on a Docker volume mounted at /data.

FROM node:22-alpine

# Install build tools needed by better-sqlite3 (compiles native C++ bindings)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifest first (Docker layer caching: only re-install
# when package.json changes, not when server.js changes)
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Remove build tools after native compilation is done (smaller final image)
RUN apk del python3 make g++

# Copy application code
COPY server.js ./

# Create the data directory (will be overridden by volume mount at runtime)
RUN mkdir -p /data/uploads

EXPOSE 3000

CMD ["node", "server.js"]
