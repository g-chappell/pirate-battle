# syntax=docker/dockerfile:1
#
# Pirate-Battle — multi-stage Dockerfile for the Fastify server (apps/server).
# The web client (apps/web) is built into static assets and served either by
# the server itself or by nginx upstream of it. The Discord bot has its own
# image (see apps/discord/Dockerfile if/when added).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages packages
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspaces --include-workspace-root

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY . .
RUN npm run build --workspaces --if-present

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages packages
RUN npm ci --omit=dev --workspaces --include-workspace-root
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages packages
EXPOSE 3001
CMD ["node", "apps/server/dist/src/index.js"]
