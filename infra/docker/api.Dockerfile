# syntax=docker/dockerfile:1.7
# Builds the NestJS codebase once; the same image runs the API (default) or the worker:
#   docker run emcom-api                       -> node dist/main.js
#   docker run emcom-api node dist/worker.js   -> background worker
#   docker run emcom-api npx prisma migrate deploy
FROM node:20.18-bookworm-slim AS build
RUN npm install -g pnpm@9.15.0 && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
RUN pnpm install --frozen-lockfile --filter @emcom/api... --config.node-linker=isolated
RUN pnpm --filter @emcom/shared-types build && pnpm --filter @emcom/api build
RUN pnpm --filter @emcom/api deploy --prod --config.node-linker=isolated /out \
 && cp -r apps/api/dist /out/dist && cp -r apps/api/prisma /out/prisma \
 && cd /out && npx prisma generate

FROM node:20.18-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000 9464
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
