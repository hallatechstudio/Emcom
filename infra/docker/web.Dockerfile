# syntax=docker/dockerfile:1.7
FROM node:20.18-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_MEDIA_ORIGIN=http://localhost:9000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_MEDIA_ORIGIN=$NEXT_PUBLIC_MEDIA_ORIGIN NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @emcom/web... --config.node-linker=isolated
RUN pnpm --filter @emcom/shared-types build && pnpm --filter @emcom/api-client build && pnpm --filter @emcom/web build

FROM node:20.18-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
