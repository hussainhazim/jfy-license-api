# ─────────────────────────────────────────────
# Stage 1 — deps
# Install production dependencies only.
# This stage is discarded after build; nothing
# from it leaks into the final image.
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only the manifest files first so Docker
# can cache this layer. node_modules is rebuilt
# only when package.json / package-lock.json
# actually change.
COPY package.json package-lock.json ./

# --omit=dev strips nodemon and any other dev
# dependencies from the installed tree.
RUN npm ci --omit=dev

# ─────────────────────────────────────────────
# Stage 2 — production
# Lean final image: only runtime code +
# production node_modules. No build tools,
# no package managers, no shell history.
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# node:20-alpine ships a built-in "node" user
# (uid 1000). Run as that user — never root.
RUN chown node:node /app

USER node

# Copy production node_modules from the deps stage.
# --chown keeps the non-root user as file owner
# inside the image.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy application source. .dockerignore controls
# exactly what lands here — secrets and dev files
# are excluded there, not here.
COPY --chown=node:node . .

# Document the port the app binds to.
# Docker does NOT publish this automatically;
# use -p 3000:3000 (or docker-compose) at run time.
EXPOSE 3000

# ─────────────────────────────────────────────
# HEALTH CHECK
# Uses Node's built-in http module so no extra
# tools (curl/wget) are required in Alpine.
# --interval   : how often Docker polls
# --timeout    : max wait for a response
# --start-period: grace period on container boot
# --retries    : failures before marking unhealthy
# ─────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||3000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start directly with node, not npm start.
# This ensures Docker SIGTERM reaches the app
# process on container stop / restart.
CMD ["node", "server.js"]
