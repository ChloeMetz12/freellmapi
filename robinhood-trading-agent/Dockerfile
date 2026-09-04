# syntax=docker/dockerfile:1.7
#
# Standalone image for the decision-engine MCP server (src/mcp/server.ts).
# This package has no dependency on the rest of the freellmapi monorepo (see
# README "It is fully self-contained"), so unlike the top-level Dockerfile
# this one only ever needs this directory's own package.json/tsconfig.

ARG NODE_IMAGE=node:20-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV MCP_HTTP_PORT=8787

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# state/ and runs/ hold the safety/halt flag, PDT log, and learned weights —
# they must survive restarts, so docker-compose.yml bind-mounts them rather
# than relying on anything baked into the image.
RUN mkdir -p /app/state /app/runs && chown -R node:node /app/state /app/runs

USER node

EXPOSE 8787

# There's no unauthenticated /health route (requireAuth in src/mcp/server.ts
# guards every path), so a 401 from an unauthenticated POST still proves the
# process is up and listening — only a network-level failure means unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.MCP_HTTP_PORT || 8787) + '/mcp', { method: 'POST' }).then(() => process.exit(0)).catch(() => process.exit(1));"

CMD ["node", "dist/mcp/server.js"]
