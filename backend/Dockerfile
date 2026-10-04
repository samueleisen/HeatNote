# -----------------------------------------------------------------------------
# Dockerfile for HeatNote Backend (Node.js + SQLite)
# -----------------------------------------------------------------------------
# Builds a lightweight container running the Express API server.
# Data (SQLite DB + uploaded images) lives on a Docker volume mounted at /data.
#
# MULTI-STAGE BUILD:
#   Stage 1 (builder) has compilers (python3, make, g++) to build the native
#   better-sqlite3 bindings. Stage 2 (runtime) starts from a CLEAN base and
#   only copies the compiled node_modules + server.js. Compilers never reach
#   the final image -> smaller image, smaller attack surface, fewer CVEs for
#   Trivy to flag.
#
#   (Why not just `apk del` at the end? Each RUN creates a layer. Deleting
#   files in a later layer hides them but the bytes stay in the earlier layer.)

# =============================================================================
# Stage 1 — builder
# =============================================================================
FROM node:22-alpine AS builder

# Build tools needed by better-sqlite3 (compiles native C++ bindings)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifest first (Docker layer caching: only re-install
# when package.json changes, not when server.js changes)
COPY package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# =============================================================================
# Stage 2 — runtime
# =============================================================================
FROM node:22-alpine

# Pull patched versions of all OS packages (same CVE-window fix as the
# frontend Dockerfile).
#
# Then remove npm / npx / corepack / yarn. The app only needs the `node`
# binary at runtime. The package managers bundled in the official image
# regularly carry HIGH CVEs in their own dependencies, which would fail
# the Trivy gate for code we never execute.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

WORKDIR /app

# Copy compiled dependencies from the builder, then the application code.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json server.js ./

# Create the data directory owned by the unprivileged `node` user.
# A fresh named volume mounted at /data inherits this ownership.
RUN mkdir -p /data/uploads && chown -R node:node /data

# Run as non-root: if the process is ever compromised it can't modify the
# container's system files.
USER node

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
